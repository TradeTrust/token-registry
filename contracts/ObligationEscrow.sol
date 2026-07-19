// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { IERC165 } from "@openzeppelin/contracts/interfaces/IERC165.sol";
import { IObligationEscrow } from "./interfaces/IObligationEscrow.sol";
import { ITradeTrustObligationToken } from "./interfaces/ITradeTrustObligationToken.sol";
import { ITitleEscrow } from "./interfaces/ITitleEscrow.sol";
import { ITradeTrustToken } from "./interfaces/ITradeTrustToken.sol";
import { ObligationEscrowErrors } from "./interfaces/ObligationEscrowErrors.sol";

/**
 * @title ObligationEscrow
 * @dev Title escrow contract for managing beneficiaries, holders, and obligation status lifecycle.
 */
contract ObligationEscrow is Initializable, IERC165, ObligationEscrowErrors, IObligationEscrow {
  address public override registry;
  uint256 public override tokenId;

  address public override beneficiary;
  address public override holder;

  address public override prevBeneficiary;
  address public override prevHolder;

  address public override nominee;

  bool public override active;

  bytes public remark;

  TerminationReason public override terminationReason;

  bool private _registered;
  Status private _status;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

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
   * @dev Modifier to check if the bytes length is within the limit
   */
  modifier remarkLengthLimit(bytes calldata _remark) {
    if (_remark.length > 120) revert RemarkLengthExceeded();
    _;
  }

  /**
   * @notice Initializes the ObligationEscrow contract with the registry address and the tokenId
   * @param _registry The address of the registry
   * @param _tokenId The id of the token
   */
  function initialize(address _registry, uint256 _tokenId) public virtual initializer {
    __ObligationEscrow_init(_registry, _tokenId);
  }

  /**
   * @notice Initializes the ObligationEscrow contract with the registry address and the tokenId
   */
  function __ObligationEscrow_init(address _registry, uint256 _tokenId) internal virtual onlyInitializing {
    registry = _registry;
    tokenId = _tokenId;
    active = true;
  }

  /**
   * @dev See {ERC165-supportsInterface}.
   */
  function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
    return interfaceId == type(IObligationEscrow).interfaceId || interfaceId == type(ITitleEscrow).interfaceId;
  }

  /**
   * @dev See {IObligationEscrow-status}.
   */
  function status() external view override returns (Status) {
    _assertRegistered();
    return _status;
  }

  /**
   * @dev See {IObligationEscrow-isRegistered}.
   */
  function isRegistered() external view override returns (bool) {
    return _registered;
  }

  /**
   * @dev See {IObligationEscrow-accept}.
   */
  function accept(bytes calldata _remark) external override whenNotPaused whenActive remarkLengthLimit(_remark) {
    _assertRegistered();
    if (msg.sender != holder) revert CallerNotHolder();
    _assertHoldingToken();
    _transition(Status.Issued, Status.Accepted);
    remark = _remark;
    emit StatusAccepted(tokenId, holder, _remark);
  }

  /**
   * @dev See {IObligationEscrow-reject}.
   */
  function reject(bytes calldata _remark) external override whenNotPaused whenActive remarkLengthLimit(_remark) {
    _assertRegistered();
    if (msg.sender != holder) revert CallerNotHolder();
    _assertHoldingToken();
    _transition(Status.Issued, Status.Rejected);
    remark = _remark;
    emit StatusRejected(tokenId, holder, _remark);
    _terminateAndBurn(_remark, TerminationReason.Rejected);
  }

  /**
   * @dev See {IObligationEscrow-discharge}.
   */
  function discharge(bytes calldata _remark) external override whenNotPaused whenActive remarkLengthLimit(_remark) {
    _assertRegistered();
    if (msg.sender != beneficiary) revert CallerNotBeneficiary();
    _assertHoldingToken();
    _transition(Status.Accepted, Status.Discharged);
    remark = _remark;
    emit StatusDischarged(tokenId, beneficiary, _remark);
    _terminateAndBurn(_remark, TerminationReason.Discharged);
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
      (address _beneficiary, address _holder, bytes memory _remark) = abi.decode(data, (address, address, bytes));
      if (_beneficiary == address(0) || _holder == address(0)) {
        revert InvalidTokenTransferToZeroAddressOwners(_beneficiary, _holder);
      }
      _setBeneficiary(_beneficiary, "");
      _setHolder(_holder, "");
      remark = _remark;
      isMinting = true;
      _registered = true;
      _status = Status.Issued;
      emit StatusInitialized(tokenId, registry);
    } else remark = data;

    emit TokenReceived(beneficiary, holder, isMinting, registry, tokenId, remark);
    return bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
  }

  /**
   * @dev See {IObligationEscrow-nominate}.
   */
  function nominate(
    address _nominee,
    bytes calldata _remark
  ) public virtual override whenNotPaused whenActive onlyBeneficiary whenHoldingToken remarkLengthLimit(_remark) {
    if (beneficiary == _nominee) {
      revert TargetNomineeAlreadyBeneficiary();
    }
    if (nominee == _nominee) {
      revert NomineeAlreadyNominated();
    }
    prevBeneficiary = address(0);
    if (beneficiary == holder) prevHolder = address(0);
    remark = _remark;

    _setNominee(_nominee, _remark);
  }

  /**
   * @dev See {IObligationEscrow-transferBeneficiary}.
   */
  function transferBeneficiary(
    address _nominee,
    bytes calldata _remark
  ) public virtual override whenNotPaused whenActive onlyHolder whenHoldingToken remarkLengthLimit(_remark) {
    if (_nominee == address(0)) {
      revert InvalidTransferToZeroAddress();
    }
    if (!(beneficiary == holder || nominee == _nominee)) {
      revert InvalidNominee();
    }
    prevHolder = address(0);
    prevBeneficiary = beneficiary;
    remark = _remark;

    _setBeneficiary(_nominee, _remark);
  }

  /**
   * @dev See {IObligationEscrow-transferHolder}.
   */
  function transferHolder(
    address newHolder,
    bytes calldata _remark
  ) public virtual override whenNotPaused whenActive onlyHolder whenHoldingToken remarkLengthLimit(_remark) {
    if (newHolder == address(0)) {
      revert InvalidTransferToZeroAddress();
    }
    if (holder == newHolder) {
      revert RecipientAlreadyHolder();
    }
    if (beneficiary == holder) prevBeneficiary = address(0);
    prevHolder = holder;
    remark = _remark;

    _setHolder(newHolder, _remark);
  }

  /**
   * @dev See {IObligationEscrow-transferOwners}.
   */
  function transferOwners(address _nominee, address newHolder, bytes calldata _remark) external virtual override {
    transferBeneficiary(_nominee, _remark);
    transferHolder(newHolder, _remark);
  }

  /**
   * @dev See {IObligationEscrow-rejectTransferBeneficiary}.
   */
  function rejectTransferBeneficiary(
    bytes calldata _remark
  ) public virtual override whenNotPaused whenActive onlyBeneficiary whenHoldingToken remarkLengthLimit(_remark) {
    if (prevBeneficiary == address(0)) {
      revert InvalidTransferToZeroAddress();
    }
    if (beneficiary == holder) {
      revert DualRoleRejectionRequired();
    }
    remark = _remark;
    address from = beneficiary;
    address to = prevBeneficiary;

    _setBeneficiary(to, _remark);
    prevBeneficiary = address(0);
    emit RejectTransferBeneficiary(from, to, registry, tokenId, _remark);
  }

  /**
   * @dev See {IObligationEscrow-rejectTransferHolder}.
   */
  function rejectTransferHolder(
    bytes calldata _remark
  ) public virtual override whenNotPaused whenActive onlyHolder whenHoldingToken remarkLengthLimit(_remark) {
    if (prevHolder == address(0)) {
      revert InvalidTransferToZeroAddress();
    }
    if (holder == beneficiary) {
      revert DualRoleRejectionRequired();
    }
    remark = _remark;
    address from = holder;
    address to = prevHolder;

    _setHolder(to, _remark);
    prevHolder = address(0);

    emit RejectTransferHolder(from, to, registry, tokenId, _remark);
  }

  /**
   * @dev See {IObligationEscrow-rejectTransferOwners}.
   */
  function rejectTransferOwners(
    bytes calldata _remark
  )
    external
    virtual
    override
    whenNotPaused
    whenActive
    whenHoldingToken
    onlyBeneficiary
    onlyHolder
    remarkLengthLimit(_remark)
  {
    if (prevBeneficiary == address(0) || prevHolder == address(0)) {
      revert InvalidTransferToZeroAddress();
    }
    remark = _remark;
    address fromHolder = holder;
    address toHolder = prevHolder;
    address fromBeneficiary = beneficiary;
    address toBeneficiary = prevBeneficiary;
    _setBeneficiary(toBeneficiary, _remark);
    _setHolder(toHolder, _remark);
    prevBeneficiary = address(0);
    prevHolder = address(0);
    emit RejectTransferOwners(fromBeneficiary, toBeneficiary, fromHolder, toHolder, registry, tokenId, _remark);
  }

  /**
   * @dev See {IObligationEscrow-returnToIssuer}.
   */
  function returnToIssuer(
    bytes calldata _remark
  )
    external
    virtual
    override
    whenNotPaused
    whenActive
    onlyBeneficiary
    onlyHolder
    whenHoldingToken
    remarkLengthLimit(_remark)
  {
    _setNominee(address(0), "");
    ITradeTrustToken(registry).transferFrom(address(this), registry, tokenId, "");
    remark = _remark;
    prevBeneficiary = address(0);
    prevHolder = address(0);

    emit ReturnToIssuer(msg.sender, registry, tokenId, _remark);
  }

  /**
   * @dev See {IObligationEscrow-shred}.
   */
  function shred(bytes calldata _remark) external virtual override whenNotPaused whenActive remarkLengthLimit(_remark) {
    if (_isHoldingToken()) {
      revert TokenNotReturnedToIssuer();
    }
    if (msg.sender != registry) {
      revert InvalidRegistry(msg.sender);
    }
    _deactivate(_remark, TerminationReason.ReturnToIssuer);
  }

  /**
   * @dev See {IObligationEscrow-isHoldingToken}.
   */
  function isHoldingToken() external view override returns (bool) {
    return _isHoldingToken();
  }

  function _assertRegistered() private view {
    if (!_registered) revert NotRegistered();
  }

  function _assertHoldingToken() private view {
    if (!_isHoldingToken()) revert TitleEscrowNotHoldingToken();
  }

  function _transition(Status requiredStatus, Status newStatus) private {
    if (beneficiary == holder) revert OwnerHolderMustDiffer();
    Status current = _status;
    if (current != requiredStatus) revert InvalidStatusTransition(current, requiredStatus);
    _status = newStatus;
  }

  function _terminateAndBurn(bytes calldata _remark, TerminationReason reason) private {
    _setNominee(address(0), "");
    if (_isHoldingToken()) {
      ITradeTrustToken(registry).transferFrom(address(this), registry, tokenId, "");
    }
    prevBeneficiary = address(0);
    prevHolder = address(0);
    _deactivate(_remark, reason);
    ITradeTrustObligationToken(registry).burnFromEscrow(tokenId, _remark);
  }

  function _deactivate(bytes calldata _remark, TerminationReason reason) private {
    _setBeneficiary(address(0), "");
    _setHolder(address(0), "");
    active = false;
    remark = _remark;
    terminationReason = reason;
    emit Shred(registry, tokenId, reason, _remark);
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
  function _setNominee(address newNominee, bytes memory _remark) internal virtual {
    emit Nomination(nominee, newNominee, registry, tokenId, _remark);
    nominee = newNominee;
  }

  /**
   * @notice Sets the beneficiary
   * @param newBeneficiary The address of the new beneficiary
   */
  function _setBeneficiary(address newBeneficiary, bytes memory _remark) internal virtual {
    emit BeneficiaryTransfer(beneficiary, newBeneficiary, registry, tokenId, _remark);
    if (nominee != address(0)) _setNominee(address(0), "0x");
    beneficiary = newBeneficiary;
  }

  /**
   * @notice Sets the holder
   * @param newHolder The address of the new holder
   */
  function _setHolder(address newHolder, bytes memory _remark) internal virtual {
    emit HolderTransfer(holder, newHolder, registry, tokenId, _remark);
    holder = newHolder;
  }

  /**
   * @dev Storage gap for upgrades.
   */
  uint256[44] private __gap;
}
