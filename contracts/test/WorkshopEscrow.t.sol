// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {WorkshopEscrow} from "../WorkshopEscrow.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

contract WorkshopEscrowTest is Test {
    // ─── addresses ────────────────────────────────────────────────────────────
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    WorkshopEscrow internal escrow;
    MockERC20      internal usdc;

    address internal client = makeAddr("client");
    address internal maker  = makeAddr("maker");
    address internal other  = makeAddr("other");

    // 100 USDC in 6-decimal units
    uint256 internal constant ORDER_AMOUNT = 100e6;
    // deliverBy: 7 days from "now" (block.timestamp starts at 1 in forge)
    uint64  internal deliverBy;

    // ─── setUp ────────────────────────────────────────────────────────────────
    function setUp() public {
        // 0. Spoof chain ID to Arc Testnet so the WrongChain() constructor guard passes.
        vm.chainId(5042002);

        // 1. Deploy mock ERC-20 at a throwaway address to capture its runtime code.
        MockERC20 tmp = new MockERC20("USD Coin", "USDC", 6);

        // 2. Etch that bytecode to the hardcoded USDC address.
        vm.etch(USDC_ADDR, address(tmp).code);

        // 3. Bind a typed handle; storage is fresh (empty) at USDC_ADDR — good.
        usdc = MockERC20(USDC_ADDR);

        // 4. Mint working balances to test actors.
        usdc.mint(client, 1_000e6);
        usdc.mint(other,  1_000e6);

        // 5. Deploy the contract under test.
        escrow = new WorkshopEscrow();

        // 6. Pre-approve the escrow so createOrder can pull funds.
        vm.prank(client);
        usdc.approve(address(escrow), type(uint256).max);

        vm.prank(other);
        usdc.approve(address(escrow), type(uint256).max);

        // 7. Set a sensible deliverBy relative to block.timestamp.
        deliverBy = uint64(block.timestamp + 7 days);
    }

    // ─── helpers ──────────────────────────────────────────────────────────────

    /// Create a standard order from `client` to `maker` and return the order id.
    function _createOrder() internal returns (uint256 id) {
        vm.prank(client);
        id = escrow.createOrder(maker, ORDER_AMOUNT, deliverBy, "Test Workshop");
    }

    /// Create + markDelivered.
    function _createAndDeliver() internal returns (uint256 id) {
        id = _createOrder();
        vm.prank(maker);
        escrow.markDelivered(id);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  1. Deployment & initialization
    // ═══════════════════════════════════════════════════════════════════════════

    function test_OrderCountStartsAtZero() public view {
        assertEq(escrow.orderCount(), 0);
    }

    function test_UsdcConstantIsCorrect() public view {
        assertEq(address(escrow.USDC()), USDC_ADDR);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  2. createOrder — happy path & events
    // ═══════════════════════════════════════════════════════════════════════════

    function test_CreateOrder_HappyPath() public {
        uint256 clientBefore  = usdc.balanceOf(client);
        uint256 escrowBefore  = usdc.balanceOf(address(escrow));

        vm.prank(client);
        vm.expectEmit(true, true, true, true, address(escrow));
        emit WorkshopEscrow.OrderCreated(0, client, maker, ORDER_AMOUNT, deliverBy, "Test Workshop");
        uint256 id = escrow.createOrder(maker, ORDER_AMOUNT, deliverBy, "Test Workshop");

        assertEq(id, 0, "first order id should be 0");
        assertEq(escrow.orderCount(), 1, "orderCount should be 1");
        assertEq(usdc.balanceOf(client),          clientBefore - ORDER_AMOUNT, "client balance reduced");
        assertEq(usdc.balanceOf(address(escrow)), escrowBefore + ORDER_AMOUNT, "escrow balance increased");

        WorkshopEscrow.Order memory o = escrow.getOrder(0);
        assertEq(o.client,     client);
        assertEq(o.maker,      maker);
        assertEq(o.amount,     ORDER_AMOUNT);
        assertEq(o.deliverBy,  deliverBy);
        assertEq(o.deliveredAt, 0);
        assertEq(uint8(o.status), uint8(WorkshopEscrow.Status.Funded));
        assertEq(o.title,      "Test Workshop");
    }

    function test_CreateOrder_IncrementsOrderCount() public {
        _createOrder();
        assertEq(escrow.orderCount(), 1);
        _createOrder();
        assertEq(escrow.orderCount(), 2);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  3. createOrder — input validation reverts
    // ═══════════════════════════════════════════════════════════════════════════

    function test_CreateOrder_Revert_ZeroMaker() public {
        vm.prank(client);
        vm.expectRevert(WorkshopEscrow.ZeroMaker.selector);
        escrow.createOrder(address(0), ORDER_AMOUNT, deliverBy, "x");
    }

    function test_CreateOrder_Revert_MakerIsClient() public {
        vm.prank(client);
        vm.expectRevert(WorkshopEscrow.MakerIsClient.selector);
        escrow.createOrder(client, ORDER_AMOUNT, deliverBy, "x");
    }

    function test_CreateOrder_Revert_ZeroAmount() public {
        vm.prank(client);
        vm.expectRevert(WorkshopEscrow.ZeroAmount.selector);
        escrow.createOrder(maker, 0, deliverBy, "x");
    }

    function test_CreateOrder_Revert_DeadlineInPast() public {
        vm.prank(client);
        vm.expectRevert(WorkshopEscrow.DeadlineInPast.selector);
        escrow.createOrder(maker, ORDER_AMOUNT, uint64(block.timestamp), "x");
    }

    function test_CreateOrder_Revert_DeadlineInPast_StrictlyInPast() public {
        vm.prank(client);
        vm.expectRevert(WorkshopEscrow.DeadlineInPast.selector);
        escrow.createOrder(maker, ORDER_AMOUNT, uint64(block.timestamp - 1), "x");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  4. markDelivered — happy path, event, state
    // ═══════════════════════════════════════════════════════════════════════════

    function test_MarkDelivered_HappyPath() public {
        uint256 id = _createOrder();

        vm.prank(maker);
        vm.expectEmit(true, false, false, false, address(escrow));
        emit WorkshopEscrow.Delivered(id);
        escrow.markDelivered(id);

        WorkshopEscrow.Order memory o = escrow.getOrder(id);
        assertEq(uint8(o.status), uint8(WorkshopEscrow.Status.Delivered));
        assertEq(o.deliveredAt, uint64(block.timestamp));
    }

    function test_MarkDelivered_Revert_NotMaker() public {
        uint256 id = _createOrder();
        vm.prank(other);
        vm.expectRevert(WorkshopEscrow.NotMaker.selector);
        escrow.markDelivered(id);
    }

    function test_MarkDelivered_Revert_NotFunded_AfterDelivered() public {
        uint256 id = _createAndDeliver();
        vm.prank(maker);
        vm.expectRevert(WorkshopEscrow.NotFunded.selector);
        escrow.markDelivered(id);
    }

    function test_MarkDelivered_Revert_ClientCannotMark() public {
        uint256 id = _createOrder();
        vm.prank(client);
        vm.expectRevert(WorkshopEscrow.NotMaker.selector);
        escrow.markDelivered(id);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  5. release — happy paths (Funded → Released, Delivered → Released)
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Release_AfterMarkDelivered_BalancesAndEvent() public {
        uint256 id = _createAndDeliver();

        uint256 makerBefore  = usdc.balanceOf(maker);
        uint256 escrowBefore = usdc.balanceOf(address(escrow));

        vm.prank(client);
        vm.expectEmit(true, false, false, false, address(escrow));
        emit WorkshopEscrow.Released(id);
        escrow.release(id);

        assertEq(usdc.balanceOf(maker),          makerBefore  + ORDER_AMOUNT, "maker got funds");
        assertEq(usdc.balanceOf(address(escrow)), escrowBefore - ORDER_AMOUNT, "escrow drained");

        WorkshopEscrow.Order memory o = escrow.getOrder(id);
        assertEq(uint8(o.status), uint8(WorkshopEscrow.Status.Released));
    }

    function test_Release_WhileFunded_AlsoValid() public {
        // requirement 2: client can release directly from Funded state
        uint256 id = _createOrder();

        uint256 makerBefore  = usdc.balanceOf(maker);

        vm.prank(client);
        vm.expectEmit(true, false, false, false, address(escrow));
        emit WorkshopEscrow.Released(id);
        escrow.release(id);

        assertEq(usdc.balanceOf(maker), makerBefore + ORDER_AMOUNT, "maker received funds");
        assertEq(uint8(escrow.getOrder(id).status), uint8(WorkshopEscrow.Status.Released));
    }

    function test_Release_Revert_NotClient() public {
        uint256 id = _createAndDeliver();
        vm.prank(maker);
        vm.expectRevert(WorkshopEscrow.NotClient.selector);
        escrow.release(id);
    }

    function test_Release_Revert_NonParticipant() public {
        uint256 id = _createAndDeliver();
        vm.prank(other);
        vm.expectRevert(WorkshopEscrow.NotClient.selector);
        escrow.release(id);
    }

    function test_Release_Revert_DoubleRelease() public {
        // requirement 12
        uint256 id = _createAndDeliver();
        vm.prank(client);
        escrow.release(id);

        vm.prank(client);
        vm.expectRevert(WorkshopEscrow.NotActive.selector);
        escrow.release(id);
    }

    function test_Release_Revert_AfterRefund() public {
        // requirement 13: double-release after refund
        uint256 id = _createOrder();
        vm.prank(maker);
        escrow.refund(id);

        vm.prank(client);
        vm.expectRevert(WorkshopEscrow.NotActive.selector);
        escrow.release(id);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  6. refund — happy paths
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Refund_WhileFunded_ReturnsToClient() public {
        // requirement 3
        uint256 id = _createOrder();
        uint256 clientBefore = usdc.balanceOf(client);

        vm.prank(maker);
        vm.expectEmit(true, false, false, false, address(escrow));
        emit WorkshopEscrow.Refunded(id);
        escrow.refund(id);

        assertEq(usdc.balanceOf(client), clientBefore + ORDER_AMOUNT, "client refunded");
        assertEq(uint8(escrow.getOrder(id).status), uint8(WorkshopEscrow.Status.Refunded));
    }

    function test_Refund_AfterDelivery_ReturnsToClient() public {
        // requirement 4
        uint256 id = _createAndDeliver();
        uint256 clientBefore = usdc.balanceOf(client);

        vm.prank(maker);
        vm.expectEmit(true, false, false, false, address(escrow));
        emit WorkshopEscrow.Refunded(id);
        escrow.refund(id);

        assertEq(usdc.balanceOf(client), clientBefore + ORDER_AMOUNT, "client refunded after delivery");
        assertEq(uint8(escrow.getOrder(id).status), uint8(WorkshopEscrow.Status.Refunded));
    }

    function test_Refund_Revert_NotMaker() public {
        uint256 id = _createOrder();
        vm.prank(client);
        vm.expectRevert(WorkshopEscrow.NotMaker.selector);
        escrow.refund(id);
    }

    function test_Refund_Revert_NonParticipant() public {
        uint256 id = _createOrder();
        vm.prank(other);
        vm.expectRevert(WorkshopEscrow.NotMaker.selector);
        escrow.refund(id);
    }

    function test_Refund_Revert_AfterRelease() public {
        uint256 id = _createOrder();
        vm.prank(client);
        escrow.release(id);

        vm.prank(maker);
        vm.expectRevert(WorkshopEscrow.NotActive.selector);
        escrow.refund(id);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  7. reclaim — happy path & reverts
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Reclaim_AfterDeadline_HappyPath() public {
        // requirement 5
        uint256 id = _createOrder();
        uint256 clientBefore = usdc.balanceOf(client);

        // Warp past deliverBy
        vm.warp(uint256(deliverBy) + 1);

        vm.prank(client);
        vm.expectEmit(true, false, false, false, address(escrow));
        emit WorkshopEscrow.Reclaimed(id);
        escrow.reclaim(id);

        assertEq(usdc.balanceOf(client), clientBefore + ORDER_AMOUNT, "client reclaimed funds");
        assertEq(uint8(escrow.getOrder(id).status), uint8(WorkshopEscrow.Status.Reclaimed));
    }

    function test_Reclaim_Revert_BeforeDeadline() public {
        // requirement 6
        uint256 id = _createOrder();
        // Still before deliverBy
        vm.warp(uint256(deliverBy) - 1);

        vm.prank(client);
        vm.expectRevert(WorkshopEscrow.DeadlineNotPassed.selector);
        escrow.reclaim(id);
    }

    function test_Reclaim_Revert_ExactlyAtDeadline() public {
        uint256 id = _createOrder();
        vm.warp(uint256(deliverBy));

        vm.prank(client);
        vm.expectRevert(WorkshopEscrow.DeadlineNotPassed.selector);
        escrow.reclaim(id);
    }

    function test_Reclaim_Revert_AfterMarkDelivered() public {
        // requirement 7: status is Delivered → MustBeFunded
        uint256 id = _createAndDeliver();
        vm.warp(uint256(deliverBy) + 1);

        vm.prank(client);
        vm.expectRevert(WorkshopEscrow.MustBeFunded.selector);
        escrow.reclaim(id);
    }

    function test_Reclaim_Revert_NotClient() public {
        uint256 id = _createOrder();
        vm.warp(uint256(deliverBy) + 1);

        vm.prank(maker);
        vm.expectRevert(WorkshopEscrow.NotClient.selector);
        escrow.reclaim(id);
    }

    function test_Reclaim_Revert_NonParticipant() public {
        uint256 id = _createOrder();
        vm.warp(uint256(deliverBy) + 1);

        vm.prank(other);
        vm.expectRevert(WorkshopEscrow.NotClient.selector);
        escrow.reclaim(id);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  8. claimAfterSilence — happy path & reverts
    // ═══════════════════════════════════════════════════════════════════════════

    function test_ClaimAfterSilence_HappyPath() public {
        // requirement 8
        uint256 id = _createAndDeliver();
        uint256 deliveredAt = escrow.getOrder(id).deliveredAt;
        uint256 makerBefore = usdc.balanceOf(maker);

        // Warp past 7-day silence window
        vm.warp(deliveredAt + 7 days + 1);

        vm.prank(maker);
        vm.expectEmit(true, false, false, false, address(escrow));
        emit WorkshopEscrow.Released(id);
        escrow.claimAfterSilence(id);

        assertEq(usdc.balanceOf(maker), makerBefore + ORDER_AMOUNT, "maker received funds");
        assertEq(uint8(escrow.getOrder(id).status), uint8(WorkshopEscrow.Status.Released));
    }

    function test_ClaimAfterSilence_Revert_Before7Days() public {
        // requirement 9
        uint256 id = _createAndDeliver();
        uint256 deliveredAt = escrow.getOrder(id).deliveredAt;

        // Warp to exactly the boundary (still not past)
        vm.warp(deliveredAt + 7 days);

        vm.prank(maker);
        vm.expectRevert(WorkshopEscrow.SilencePeriodNotOver.selector);
        escrow.claimAfterSilence(id);
    }

    function test_ClaimAfterSilence_Revert_JustBefore7Days() public {
        uint256 id = _createAndDeliver();
        uint256 deliveredAt = escrow.getOrder(id).deliveredAt;

        vm.warp(deliveredAt + 7 days - 1);

        vm.prank(maker);
        vm.expectRevert(WorkshopEscrow.SilencePeriodNotOver.selector);
        escrow.claimAfterSilence(id);
    }

    function test_ClaimAfterSilence_Revert_NotDelivered_WhenFunded() public {
        // requirement 10
        uint256 id = _createOrder();
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(maker);
        vm.expectRevert(WorkshopEscrow.NotDelivered.selector);
        escrow.claimAfterSilence(id);
    }

    function test_ClaimAfterSilence_Revert_NotDelivered_WhenReleased() public {
        uint256 id = _createAndDeliver();
        uint256 deliveredAt = escrow.getOrder(id).deliveredAt;
        vm.warp(deliveredAt + 7 days + 1);

        // Client releases first
        vm.prank(client);
        escrow.release(id);

        // Now maker tries claimAfterSilence on Released status
        vm.prank(maker);
        vm.expectRevert(WorkshopEscrow.NotDelivered.selector);
        escrow.claimAfterSilence(id);
    }

    function test_ClaimAfterSilence_Revert_NotMaker() public {
        // requirement 11 (partial — claimAfterSilence access control)
        uint256 id = _createAndDeliver();
        uint256 deliveredAt = escrow.getOrder(id).deliveredAt;
        vm.warp(deliveredAt + 7 days + 1);

        vm.prank(client);
        vm.expectRevert(WorkshopEscrow.NotMaker.selector);
        escrow.claimAfterSilence(id);
    }

    function test_ClaimAfterSilence_Revert_NonParticipant() public {
        uint256 id = _createAndDeliver();
        uint256 deliveredAt = escrow.getOrder(id).deliveredAt;
        vm.warp(deliveredAt + 7 days + 1);

        vm.prank(other);
        vm.expectRevert(WorkshopEscrow.NotMaker.selector);
        escrow.claimAfterSilence(id);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  9. Full access control matrix (requirement 11)
    // ═══════════════════════════════════════════════════════════════════════════

    function test_AccessControl_MarkDelivered_OnlyMaker() public {
        uint256 id = _createOrder();

        vm.prank(other);
        vm.expectRevert(WorkshopEscrow.NotMaker.selector);
        escrow.markDelivered(id);
    }

    function test_AccessControl_Release_OnlyClient() public {
        uint256 id = _createAndDeliver();

        vm.prank(other);
        vm.expectRevert(WorkshopEscrow.NotClient.selector);
        escrow.release(id);
    }

    function test_AccessControl_Refund_OnlyMaker() public {
        uint256 id = _createOrder();

        vm.prank(other);
        vm.expectRevert(WorkshopEscrow.NotMaker.selector);
        escrow.refund(id);
    }

    function test_AccessControl_Reclaim_OnlyClient() public {
        uint256 id = _createOrder();
        vm.warp(uint256(deliverBy) + 1);

        vm.prank(other);
        vm.expectRevert(WorkshopEscrow.NotClient.selector);
        escrow.reclaim(id);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  10. Balance invariant — escrow holds 0 USDC after settlement (req 15)
    // ═══════════════════════════════════════════════════════════════════════════

    function test_BalanceInvariant_AfterRelease() public {
        _createAndDeliver();
        vm.prank(client);
        escrow.release(0);
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow should be empty after release");
    }

    function test_BalanceInvariant_AfterRefund() public {
        _createOrder();
        vm.prank(maker);
        escrow.refund(0);
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow should be empty after refund");
    }

    function test_BalanceInvariant_AfterReclaim() public {
        _createOrder();
        vm.warp(uint256(deliverBy) + 1);
        vm.prank(client);
        escrow.reclaim(0);
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow should be empty after reclaim");
    }

    function test_BalanceInvariant_AfterClaimAfterSilence() public {
        uint256 id = _createAndDeliver();
        uint256 deliveredAt = escrow.getOrder(id).deliveredAt;
        vm.warp(deliveredAt + 7 days + 1);
        vm.prank(maker);
        escrow.claimAfterSilence(id);
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow should be empty after claimAfterSilence");
    }

    function test_BalanceInvariant_MultipleOrdersAllSettled() public {
        // Create two orders, settle each via a different path
        uint256 id0 = _createOrder();  // will be released
        uint256 id1 = _createOrder();  // will be refunded

        // settle id0 via release
        vm.prank(maker);
        escrow.markDelivered(id0);
        vm.prank(client);
        escrow.release(id0);

        // settle id1 via refund
        vm.prank(maker);
        escrow.refund(id1);

        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow should be empty after all settlements");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  11. View functions — ordersOfClient / ordersOfMaker / orderCount (req 16)
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Views_OrdersOfClientAndMaker() public {
        uint256 id0 = _createOrder();
        uint256 id1 = _createOrder();

        uint256[] memory clientOrders = escrow.ordersOfClient(client);
        assertEq(clientOrders.length, 2);
        assertEq(clientOrders[0], id0);
        assertEq(clientOrders[1], id1);

        uint256[] memory makerOrders = escrow.ordersOfMaker(maker);
        assertEq(makerOrders.length, 2);
        assertEq(makerOrders[0], id0);
        assertEq(makerOrders[1], id1);
    }

    function test_Views_EmptyBeforeAnyOrders() public view {
        assertEq(escrow.ordersOfClient(client).length, 0);
        assertEq(escrow.ordersOfMaker(maker).length, 0);
        assertEq(escrow.orderCount(), 0);
    }

    function test_Views_OrderCount_AfterMultipleCreations() public {
        _createOrder();
        assertEq(escrow.orderCount(), 1);
        _createOrder();
        assertEq(escrow.orderCount(), 2);
        _createOrder();
        assertEq(escrow.orderCount(), 3);
    }

    function test_Views_GetOrder_ReturnsCorrectData() public {
        uint256 id = _createOrder();
        WorkshopEscrow.Order memory o = escrow.getOrder(id);

        assertEq(o.client,    client);
        assertEq(o.maker,     maker);
        assertEq(o.amount,    ORDER_AMOUNT);
        assertEq(o.deliverBy, deliverBy);
        assertEq(o.title,     "Test Workshop");
    }

    function test_Views_GetOrder_Revert_OrderNotFound() public {
        vm.expectRevert(WorkshopEscrow.OrderNotFound.selector);
        escrow.getOrder(999);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  12. Fuzz — createOrder amount and balance accounting
    // ═══════════════════════════════════════════════════════════════════════════

    function testFuzz_CreateAndRelease_BalancesAddUp(uint128 amount) public {
        uint256 amt = bound(uint256(amount), 1, 500e6); // 0.000001 → 500 USDC

        // Ensure client has enough
        usdc.mint(client, amt);

        vm.prank(client);
        usdc.approve(address(escrow), amt);

        uint256 clientBefore = usdc.balanceOf(client);
        uint256 makerBefore  = usdc.balanceOf(maker);
        uint256 escrowBefore = usdc.balanceOf(address(escrow));

        vm.prank(client);
        uint256 id = escrow.createOrder(maker, amt, deliverBy, "fuzz");

        assertEq(usdc.balanceOf(client),          clientBefore - amt);
        assertEq(usdc.balanceOf(address(escrow)), escrowBefore + amt);

        vm.prank(maker);
        escrow.markDelivered(id);

        vm.prank(client);
        escrow.release(id);

        assertEq(usdc.balanceOf(maker),           makerBefore  + amt);
        assertEq(usdc.balanceOf(address(escrow)), escrowBefore, "escrow back to original");
    }

    function testFuzz_CreateAndRefund_BalancesAddUp(uint128 amount) public {
        uint256 amt = bound(uint256(amount), 1, 500e6);

        usdc.mint(client, amt);
        vm.prank(client);
        usdc.approve(address(escrow), amt);

        uint256 clientBefore = usdc.balanceOf(client);

        vm.prank(client);
        uint256 id = escrow.createOrder(maker, amt, deliverBy, "fuzz-refund");

        vm.prank(maker);
        escrow.refund(id);

        assertEq(usdc.balanceOf(client), clientBefore, "client balance fully restored after refund");
        assertEq(usdc.balanceOf(address(escrow)), 0,   "escrow drained");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  13. Invariant — escrow USDC balance == sum of funded order amounts
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Wrapped handler for the invariant suite.
    function invariant_EscrowBalanceEqualsFundedOrders() public view {
        // Count all funded (Funded + Delivered) orders and sum their amounts.
        uint256 n = escrow.orderCount();
        uint256 expected = 0;
        for (uint256 i = 0; i < n; i++) {
            WorkshopEscrow.Order memory o = escrow.getOrder(i);
            if (o.status == WorkshopEscrow.Status.Funded || o.status == WorkshopEscrow.Status.Delivered) {
                expected += o.amount;
            }
        }
        assertEq(usdc.balanceOf(address(escrow)), expected, "escrow balance mismatch");
    }
}
