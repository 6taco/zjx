// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CertificateRegistry {
  struct Certificate {
    string certHash;
    string ipfsHash;
    address issuer;
    uint256 timestamp;
    bool revoked;
  }

  address public owner;
  mapping(string => Certificate) private certificates;
  mapping(address => bool) public authorizedIssuers;
  uint256 public certificateCount;

  event CertificateStored(
    string indexed certHashIndexed,
    string certHash,
    string ipfsHash,
    address indexed issuer,
    uint256 timestamp
  );
  event CertificateRevoked(
    string indexed certHashIndexed,
    string certHash,
    address indexed revokedBy,
    uint256 timestamp
  );
  event IssuerAuthorized(address indexed issuer);
  event IssuerRevoked(address indexed issuer);
  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

  modifier onlyOwner() {
    require(msg.sender == owner, "only owner");
    _;
  }

  modifier onlyAuthorized() {
    require(msg.sender == owner || authorizedIssuers[msg.sender], "not authorized");
    _;
  }

  constructor() {
    owner = msg.sender;
    authorizedIssuers[msg.sender] = true;
  }

  function transferOwnership(address newOwner) external onlyOwner {
    require(newOwner != address(0), "zero address");
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
    authorizedIssuers[newOwner] = true;
  }

  function authorizeIssuer(address issuer) external onlyOwner {
    require(issuer != address(0), "zero address");
    authorizedIssuers[issuer] = true;
    emit IssuerAuthorized(issuer);
  }

  function revokeIssuer(address issuer) external onlyOwner {
    require(issuer != owner, "cannot revoke owner");
    authorizedIssuers[issuer] = false;
    emit IssuerRevoked(issuer);
  }

  function storeCertificate(string calldata certHash, string calldata ipfsHash) external onlyAuthorized {
    require(bytes(certHash).length > 0, "certHash required");
    require(bytes(ipfsHash).length > 0, "ipfsHash required");

    Certificate storage existing = certificates[certHash];
    require(bytes(existing.certHash).length == 0, "certificate exists");

    certificates[certHash] = Certificate({
      certHash: certHash,
      ipfsHash: ipfsHash,
      issuer: msg.sender,
      timestamp: block.timestamp,
      revoked: false
    });
    certificateCount += 1;

    emit CertificateStored(certHash, certHash, ipfsHash, msg.sender, block.timestamp);
  }

  function storeCertificateBatch(
    string[] calldata certHashes,
    string[] calldata ipfsHashes
  ) external onlyAuthorized {
    require(certHashes.length == ipfsHashes.length, "length mismatch");
    require(certHashes.length > 0 && certHashes.length <= 50, "batch 1-50");

    for (uint256 i = 0; i < certHashes.length; i++) {
      string calldata ch = certHashes[i];
      string calldata ih = ipfsHashes[i];
      require(bytes(ch).length > 0, "certHash required");
      require(bytes(ih).length > 0, "ipfsHash required");

      Certificate storage existing = certificates[ch];
      if (bytes(existing.certHash).length > 0) {
        continue;
      }

      certificates[ch] = Certificate({
        certHash: ch,
        ipfsHash: ih,
        issuer: msg.sender,
        timestamp: block.timestamp,
        revoked: false
      });
      certificateCount += 1;
      emit CertificateStored(ch, ch, ih, msg.sender, block.timestamp);
    }
  }

  function revokeCertificate(string calldata certHash) external {
    Certificate storage cert = certificates[certHash];
    require(bytes(cert.certHash).length > 0, "certificate not found");
    require(!cert.revoked, "already revoked");
    require(
      msg.sender == cert.issuer || msg.sender == owner,
      "only issuer or owner"
    );

    cert.revoked = true;
    emit CertificateRevoked(certHash, certHash, msg.sender, block.timestamp);
  }

  function verifyCertificate(string calldata certHash)
    external
    view
    returns (string memory ipfsHash, address issuer, uint256 timestamp)
  {
    Certificate storage cert = certificates[certHash];
    require(bytes(cert.certHash).length > 0, "certificate not found");
    return (cert.ipfsHash, cert.issuer, cert.timestamp);
  }

  function verifyCertificateEx(string calldata certHash)
    external
    view
    returns (
      string memory ipfsHash,
      address issuer,
      uint256 timestamp,
      bool revoked
    )
  {
    Certificate storage cert = certificates[certHash];
    require(bytes(cert.certHash).length > 0, "certificate not found");
    return (cert.ipfsHash, cert.issuer, cert.timestamp, cert.revoked);
  }

  function certificateExists(string calldata certHash) external view returns (bool) {
    return bytes(certificates[certHash].certHash).length > 0;
  }
}
