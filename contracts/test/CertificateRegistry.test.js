const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CertificateRegistry", function () {
  let registry;
  let owner;
  let issuer1;
  let issuer2;
  let stranger;

  beforeEach(async function () {
    [owner, issuer1, issuer2, stranger] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("CertificateRegistry");
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  describe("Deployment", function () {
    it("should set deployer as owner", async function () {
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("should authorize owner as issuer", async function () {
      expect(await registry.authorizedIssuers(owner.address)).to.equal(true);
    });

    it("should start with zero certificate count", async function () {
      expect(await registry.certificateCount()).to.equal(0);
    });
  });

  describe("Access Control", function () {
    it("should allow owner to authorize an issuer", async function () {
      await expect(registry.authorizeIssuer(issuer1.address))
        .to.emit(registry, "IssuerAuthorized")
        .withArgs(issuer1.address);
      expect(await registry.authorizedIssuers(issuer1.address)).to.equal(true);
    });

    it("should allow owner to revoke an issuer", async function () {
      await registry.authorizeIssuer(issuer1.address);
      await expect(registry.revokeIssuer(issuer1.address))
        .to.emit(registry, "IssuerRevoked")
        .withArgs(issuer1.address);
      expect(await registry.authorizedIssuers(issuer1.address)).to.equal(false);
    });

    it("should not allow revoking the owner", async function () {
      await expect(registry.revokeIssuer(owner.address))
        .to.be.revertedWith("cannot revoke owner");
    });

    it("should not allow non-owner to authorize issuers", async function () {
      await expect(registry.connect(stranger).authorizeIssuer(issuer1.address))
        .to.be.revertedWith("only owner");
    });

    it("should not allow authorizing zero address", async function () {
      await expect(registry.authorizeIssuer(ethers.ZeroAddress))
        .to.be.revertedWith("zero address");
    });

    it("should allow owner to transfer ownership", async function () {
      await expect(registry.transferOwnership(issuer1.address))
        .to.emit(registry, "OwnershipTransferred")
        .withArgs(owner.address, issuer1.address);
      expect(await registry.owner()).to.equal(issuer1.address);
      expect(await registry.authorizedIssuers(issuer1.address)).to.equal(true);
    });

    it("should not allow transferring ownership to zero address", async function () {
      await expect(registry.transferOwnership(ethers.ZeroAddress))
        .to.be.revertedWith("zero address");
    });
  });

  describe("storeCertificate", function () {
    it("should store a certificate by owner", async function () {
      const tx = await registry.storeCertificate("hash1", "ipfs1");
      await expect(tx)
        .to.emit(registry, "CertificateStored");
      expect(await registry.certificateCount()).to.equal(1);
      expect(await registry.certificateExists("hash1")).to.equal(true);
    });

    it("should store a certificate by authorized issuer", async function () {
      await registry.authorizeIssuer(issuer1.address);
      await registry.connect(issuer1).storeCertificate("hash2", "ipfs2");
      expect(await registry.certificateCount()).to.equal(1);
    });

    it("should reject storage by unauthorized address", async function () {
      await expect(registry.connect(stranger).storeCertificate("hash3", "ipfs3"))
        .to.be.revertedWith("not authorized");
    });

    it("should reject duplicate certHash", async function () {
      await registry.storeCertificate("hash4", "ipfs4");
      await expect(registry.storeCertificate("hash4", "ipfs4_dup"))
        .to.be.revertedWith("certificate exists");
    });

    it("should reject empty certHash", async function () {
      await expect(registry.storeCertificate("", "ipfs5"))
        .to.be.revertedWith("certHash required");
    });

    it("should reject empty ipfsHash", async function () {
      await expect(registry.storeCertificate("hash5", ""))
        .to.be.revertedWith("ipfsHash required");
    });
  });

  describe("storeCertificateBatch", function () {
    it("should store multiple certificates in one tx", async function () {
      const hashes = ["b1", "b2", "b3"];
      const ipfs = ["i1", "i2", "i3"];
      await registry.storeCertificateBatch(hashes, ipfs);
      expect(await registry.certificateCount()).to.equal(3);
      for (const h of hashes) {
        expect(await registry.certificateExists(h)).to.equal(true);
      }
    });

    it("should skip already existing certificates", async function () {
      await registry.storeCertificate("b1", "i1");
      await registry.storeCertificateBatch(["b1", "b2"], ["i1_dup", "i2"]);
      expect(await registry.certificateCount()).to.equal(2);
      const result = await registry.verifyCertificate("b1");
      expect(result.ipfsHash).to.equal("i1");
    });

    it("should reject mismatched array lengths", async function () {
      await expect(registry.storeCertificateBatch(["h1", "h2"], ["i1"]))
        .to.be.revertedWith("length mismatch");
    });

    it("should reject empty batch", async function () {
      await expect(registry.storeCertificateBatch([], []))
        .to.be.revertedWith("batch 1-50");
    });

    it("should reject batch larger than 50", async function () {
      const hashes = Array.from({ length: 51 }, (_, i) => `h${i}`);
      const ipfs = Array.from({ length: 51 }, (_, i) => `i${i}`);
      await expect(registry.storeCertificateBatch(hashes, ipfs))
        .to.be.revertedWith("batch 1-50");
    });

    it("should reject unauthorized batch storage", async function () {
      await expect(registry.connect(stranger).storeCertificateBatch(["h1"], ["i1"]))
        .to.be.revertedWith("not authorized");
    });
  });

  describe("verifyCertificate", function () {
    it("should return correct data for stored certificate", async function () {
      await registry.storeCertificate("vhash", "vipfs");
      const result = await registry.verifyCertificate("vhash");
      expect(result.ipfsHash).to.equal("vipfs");
      expect(result.issuer).to.equal(owner.address);
      expect(result.timestamp).to.be.greaterThan(0);
    });

    it("should revert for non-existent certificate", async function () {
      await expect(registry.verifyCertificate("nonexistent"))
        .to.be.revertedWith("certificate not found");
    });
  });

  describe("verifyCertificateEx", function () {
    it("should return revoked=false for active certificate", async function () {
      await registry.storeCertificate("exhash", "exipfs");
      const result = await registry.verifyCertificateEx("exhash");
      expect(result.revoked).to.equal(false);
    });

    it("should return revoked=true after revocation", async function () {
      await registry.storeCertificate("exhash2", "exipfs2");
      await registry.revokeCertificate("exhash2");
      const result = await registry.verifyCertificateEx("exhash2");
      expect(result.revoked).to.equal(true);
    });
  });

  describe("revokeCertificate", function () {
    beforeEach(async function () {
      await registry.authorizeIssuer(issuer1.address);
      await registry.connect(issuer1).storeCertificate("rhash", "ripfs");
    });

    it("should allow issuer to revoke their own certificate", async function () {
      await expect(registry.connect(issuer1).revokeCertificate("rhash"))
        .to.emit(registry, "CertificateRevoked");
    });

    it("should allow owner to revoke any certificate", async function () {
      await expect(registry.revokeCertificate("rhash"))
        .to.emit(registry, "CertificateRevoked");
    });

    it("should reject revocation by stranger", async function () {
      await expect(registry.connect(stranger).revokeCertificate("rhash"))
        .to.be.revertedWith("only issuer or owner");
    });

    it("should reject double revocation", async function () {
      await registry.revokeCertificate("rhash");
      await expect(registry.revokeCertificate("rhash"))
        .to.be.revertedWith("already revoked");
    });

    it("should reject revoking non-existent certificate", async function () {
      await expect(registry.revokeCertificate("nonexistent"))
        .to.be.revertedWith("certificate not found");
    });
  });

  describe("certificateExists", function () {
    it("should return false for non-existent certificate", async function () {
      expect(await registry.certificateExists("nope")).to.equal(false);
    });

    it("should return true for stored certificate", async function () {
      await registry.storeCertificate("exists_hash", "exists_ipfs");
      expect(await registry.certificateExists("exists_hash")).to.equal(true);
    });
  });
});
