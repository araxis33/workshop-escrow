// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract WorkshopEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Arc USDC. Hardcoded for Arc Testnet (5042002) and Arc Mainnet (5042).
    ///         If either party is Circle-blocklisted after order creation, the
    ///         corresponding settlement path will revert and funds cannot be recovered
    ///         without Circle intervention. This is a known limitation of escrow over
    ///         a permissioned token with no admin recovery role.
    IERC20 public constant USDC = IERC20(0x3600000000000000000000000000000000000000);

    constructor() {
        if (block.chainid != 5042002 && block.chainid != 5042) revert WrongChain();
    }

    enum Status {
        Funded,
        Delivered,
        Released,
        Refunded,
        Reclaimed
    }

    struct Order {
        address client;
        address maker;
        uint256 amount;
        uint64 deliverBy;
        uint64 deliveredAt;
        Status status;
        string title;
    }

    mapping(uint256 => Order) private _orders;
    mapping(address => uint256[]) private _clientOrders;
    mapping(address => uint256[]) private _makerOrders;
    uint256 private _orderCount;

    error ZeroMaker();
    error MakerIsClient();
    error ZeroAmount();
    error DeadlineInPast();
    error WrongChain();
    error NotMaker();
    error NotFunded();
    error DeadlinePassedForDelivery();
    error NotClient();
    error NotActive();
    error MustBeFunded();
    error DeadlineNotPassed();
    error NotDelivered();
    error SilencePeriodNotOver();
    error OrderNotFound();

    event OrderCreated(
        uint256 indexed id,
        address indexed client,
        address indexed maker,
        uint256 amount,
        uint64 deliverBy,
        string title
    );
    event Delivered(uint256 indexed id);
    event Released(uint256 indexed id);
    event Refunded(uint256 indexed id);
    event Reclaimed(uint256 indexed id);

    function createOrder(address maker, uint256 amount, uint64 deliverBy, string calldata title)
        external
        nonReentrant
        returns (uint256)
    {
        if (maker == address(0)) revert ZeroMaker();
        if (maker == msg.sender) revert MakerIsClient();
        if (amount == 0) revert ZeroAmount();
        if (deliverBy <= block.timestamp) revert DeadlineInPast();

        uint256 id = _orderCount;
        _orderCount++;

        _orders[id] = Order({
            client: msg.sender,
            maker: maker,
            amount: amount,
            deliverBy: deliverBy,
            deliveredAt: 0,
            status: Status.Funded,
            title: title
        });

        _clientOrders[msg.sender].push(id);
        _makerOrders[maker].push(id);

        USDC.safeTransferFrom(msg.sender, address(this), amount);

        emit OrderCreated(id, msg.sender, maker, amount, deliverBy, title);

        return id;
    }

    function markDelivered(uint256 id) external {
        _requireOrderExists(id);

        Order storage order = _orders[id];

        if (msg.sender != order.maker) revert NotMaker();
        if (order.status != Status.Funded) revert NotFunded();
        if (block.timestamp > order.deliverBy) revert DeadlinePassedForDelivery();

        order.status = Status.Delivered;
        order.deliveredAt = uint64(block.timestamp);

        emit Delivered(id);
    }

    function release(uint256 id) external nonReentrant {
        _requireOrderExists(id);

        Order storage order = _orders[id];

        if (msg.sender != order.client) revert NotClient();
        if (order.status != Status.Funded && order.status != Status.Delivered) revert NotActive();

        order.status = Status.Released;

        USDC.safeTransfer(order.maker, order.amount);

        emit Released(id);
    }

    function refund(uint256 id) external nonReentrant {
        _requireOrderExists(id);

        Order storage order = _orders[id];

        if (msg.sender != order.maker) revert NotMaker();
        if (order.status != Status.Funded && order.status != Status.Delivered) revert NotActive();

        order.status = Status.Refunded;

        USDC.safeTransfer(order.client, order.amount);

        emit Refunded(id);
    }

    function reclaim(uint256 id) external nonReentrant {
        _requireOrderExists(id);

        Order storage order = _orders[id];

        if (msg.sender != order.client) revert NotClient();
        if (order.status != Status.Funded) revert MustBeFunded();
        if (block.timestamp <= order.deliverBy) revert DeadlineNotPassed();

        order.status = Status.Reclaimed;

        USDC.safeTransfer(order.client, order.amount);

        emit Reclaimed(id);
    }

    function claimAfterSilence(uint256 id) external nonReentrant {
        _requireOrderExists(id);

        Order storage order = _orders[id];

        if (msg.sender != order.maker) revert NotMaker();
        if (order.status != Status.Delivered) revert NotDelivered();
        if (block.timestamp <= uint256(order.deliveredAt) + 7 days) revert SilencePeriodNotOver();

        order.status = Status.Released;

        USDC.safeTransfer(order.maker, order.amount);

        emit Released(id);
    }

    function getOrder(uint256 id) external view returns (Order memory) {
        _requireOrderExists(id);
        return _orders[id];
    }

    function ordersOfClient(address who) external view returns (uint256[] memory) {
        return _clientOrders[who];
    }

    function ordersOfMaker(address who) external view returns (uint256[] memory) {
        return _makerOrders[who];
    }

    function orderCount() external view returns (uint256) {
        return _orderCount;
    }

    function _requireOrderExists(uint256 id) private view {
        if (id >= _orderCount) revert OrderNotFound();
    }
}
