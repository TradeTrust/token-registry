// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/interfaces/IERC165.sol";
import "./interfaces/ITitleEscrow.sol";
import "./interfaces/ITradeTrustToken.sol";
import "./interfaces/TitleEscrowErrors.sol";

/**
 * @title TitleEscrow
 * @dev Title escrow contract for managing the beneficiaries and holders of a transferable record.
 */
contract TitleEscrow is Initializable, IERC165, TitleEscrowErrors, ITitleEscrow {
  address public override registry;
  uint256 public override tokenId;

  address public override beneficiary;
  address public override holder;

  address public override nominee;

  bool public override active;

  constructor() initializer {}

  /**
   * @dev Modifier to make a function callable only by the beneficiary.
   */
  modifier onlyBeneficiary() {
    if (msg.sender != beneficiary) {
      revert CallerNotBeneficiary();
    }
    _;
  }

  /**
   * @dev Modifier to make a function callable only by the holder.
   */
  modifier onlyHolder() {
    if (msg.sender != holder) {
      revert CallerNotHolder();
    }
    _;
  }

  /**
   * @dev Modifier to ensure the contract is holding the token.
   */
  modifier whenHoldingToken() {
    if (!_isHoldingToken()) {
      revert TitleEscrowNotHoldingToken();
    }
    _;
  }

  /**
   * @dev Modifier to ensure the registry is not paused.
   */
  modifier whenNotPaused() {
    bool paused = Pausable(registry).paused();
    if (paused) {
      revert RegistryContractPaused();
    }
    _;
  }

  /**
   * @dev Modifier to ensure the title escrow is active.
   */
  modifier whenActive() {
    if (!active) {
      revert InactiveTitleEscrow();
    }
    _;
  }
  /**
   * @dev Modifier to check if the bytes array length is within the limit
   */
  modifier remarkLengthLimit(bytes memory remark) {
    if (remark.length > 120) revert RemarkLengthExceeded();
    _;
  }

  /**
   * @notice Initializes the TitleEscrow contract with the registry address and the tokenId
   * @param _registry The address of the registry
   * @param _tokenId The id of the token
   */
  function initialize(address _registry, uint256 _tokenId) public virtual initializer {
    __TitleEscrow_init(_registry, _tokenId);
  }

  /**
   * @notice Initializes the TitleEscrow contract with the registry address and the tokenId
   */
  function __TitleEscrow_init(address _registry, uint256 _tokenId) internal virtual onlyInitializing {
    registry = _registry;
    tokenId = _tokenId;
    active = true;
  }

  /**
   * @dev See {ERC165-supportsInterface}.
   */
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == type(ITitleEscrow).interfaceId;
  }

  /**
   * @dev See {IERC721Receiver-onERC721Received}.
   */
  function onERC721Received(
    address /* operator */,
    address /* from */,
    uint256 _tokenId,
    bytes calldata data
  ) external virtual override whenNotPaused whenActive returns (bytes4) {
    if (_tokenId != tokenId) {
      revert InvalidTokenId(_tokenId);
    }
    if (msg.sender != address(registry)) {
      revert InvalidRegistry(msg.sender);
    }
    bool isMinting = false;
    if (beneficiary == address(0) || holder == address(0)) {
      if (data.length == 0) {
        revert EmptyReceivingData();
      }
      (address _beneficiary, address _holder) = abi.decode(data, (address, address));
      if (_beneficiary == address(0) || _holder == address(0)) {
        revert InvalidTokenTransferToZeroAddressOwners(_beneficiary, _holder);
      }
      _setBeneficiary(_beneficiary, "");
      _setHolder(_holder, "");
      isMinting = true;
    }

    emit TokenReceived(beneficiary, holder, isMinting, registry, tokenId);
    return bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
  }

  /**
   * @dev See {ITitleEscrow-nominate}.
   */
  function nominate(
    address _nominee,
    bytes memory remark
  ) public virtual override whenNotPaused whenActive onlyBeneficiary whenHoldingToken remarkLengthLimit(remark) {
    if (beneficiary == _nominee) {
      revert TargetNomineeAlreadyBeneficiary();
    }
    if (nominee == _nominee) {
      revert NomineeAlreadyNominated();
    }

    _setNominee(_nominee, remark);
  }

  /**
   * @dev See {ITitleEscrow-transferBeneficiary}.
   */
  function transferBeneficiary(
    address _nominee,
    bytes memory remark
  ) public virtual override whenNotPaused whenActive onlyHolder whenHoldingToken {
    if (_nominee == address(0)) {
      revert InvalidTransferToZeroAddress();
    }
    if (!(beneficiary == holder || nominee == _nominee)) {
      revert InvalidNominee();
    }

    _setBeneficiary(_nominee, remark);
  }

  /**
   * @dev See {ITitleEscrow-transferHolder}.
   */
  function transferHolder(
    address newHolder,
    bytes memory remark
  ) public virtual override whenNotPaused whenActive onlyHolder whenHoldingToken {
    if (newHolder == address(0)) {
      revert InvalidTransferToZeroAddress();
    }
    if (holder == newHolder) {
      revert RecipientAlreadyHolder();
    }

    _setHolder(newHolder, remark);
  }

  /**
   * @dev See {ITitleEscrow-transferOwners}.
   */
  function transferOwners(address _nominee, address newHolder, bytes memory remark) external virtual override {
    transferBeneficiary(_nominee, remark);
    transferHolder(newHolder, remark);
  }

  /**
   * @dev See {ITitleEscrow-surrender}.
   */
  function surrender(
    bytes memory remark
  ) external virtual override whenNotPaused whenActive onlyBeneficiary onlyHolder whenHoldingToken {
    _setNominee(address(0), "");
    ITradeTrustToken(registry).transferFrom(address(this), registry, tokenId);

    emit Surrender(msg.sender, registry, tokenId, remark);
  }

  /**
   * @dev See {ITitleEscrow-shred}.
   */
  function shred(bytes memory remark) external virtual override whenNotPaused whenActive {
    if (_isHoldingToken()) {
      revert TokenNotSurrendered();
    }
    if (msg.sender != registry) {
      revert InvalidRegistry(msg.sender);
    }

    _setBeneficiary(address(0), "");
    _setHolder(address(0), "");
    active = false;

    emit Shred(registry, tokenId, remark);
  }

  /**
   * @dev See {ITitleEscrow-isHoldingToken}.
   */
  function isHoldingToken() external view override returns (bool) {
    return _isHoldingToken();
  }

  /**
   * @notice Internal function to check if the contract is holding a token
   * @return A boolean indicating whether the contract is holding a token
   */
  function _isHoldingToken() internal view returns (bool) {
    return ITradeTrustToken(registry).ownerOf(tokenId) == address(this);
  }

  /**
   * @notice Sets the nominee
   * @param newNominee The address of the new nominee
   */
  function _setNominee(address newNominee, bytes memory remark) internal virtual {
    emit Nomination(nominee, newNominee, registry, tokenId, remark);
    nominee = newNominee;
  }

  /**
   * @notice Sets the beneficiary
   * @param newBeneficiary The address of the new beneficiary
   */
  function _setBeneficiary(address newBeneficiary, bytes memory remark) internal virtual {
    emit BeneficiaryTransfer(beneficiary, newBeneficiary, registry, tokenId, remark);
    if (nominee != address(0)) _setNominee(address(0), "");
    beneficiary = newBeneficiary;
  }

  /**
   * @notice Sets the holder
   * @param newHolder The address of the new holder
   */
  function _setHolder(address newHolder, bytes memory remark) internal virtual {
    emit HolderTransfer(holder, newHolder, registry, tokenId, remark);
    holder = newHolder;
  }
}
