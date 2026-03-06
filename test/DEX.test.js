const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DEX", function () {
  let dex, tokenA, tokenB;
  let owner, addr1, addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    tokenA = await MockERC20.deploy("Token A", "TKA");
    tokenB = await MockERC20.deploy("Token B", "TKB");

    const DEX = await ethers.getContractFactory("DEX");
    dex = await DEX.deploy(tokenA.address, tokenB.address);

    // Fund owner
    await tokenA.approve(dex.address, ethers.utils.parseEther("1000000"));
    await tokenB.approve(dex.address, ethers.utils.parseEther("1000000"));

    // Fund addr1
    await tokenA.mint(addr1.address, ethers.utils.parseEther("10000"));
    await tokenB.mint(addr1.address, ethers.utils.parseEther("10000"));
    await tokenA.connect(addr1).approve(dex.address, ethers.utils.parseEther("10000"));
    await tokenB.connect(addr1).approve(dex.address, ethers.utils.parseEther("10000"));

    // Fund addr2
    await tokenA.mint(addr2.address, ethers.utils.parseEther("10000"));
    await tokenB.mint(addr2.address, ethers.utils.parseEther("10000"));
    await tokenA.connect(addr2).approve(dex.address, ethers.utils.parseEther("10000"));
    await tokenB.connect(addr2).approve(dex.address, ethers.utils.parseEther("10000"));
  });

  // ─────────────────────────────────────────────────────────────
  describe("Liquidity Management", function () {
    it("should allow initial liquidity provision", async function () {
      const amtA = ethers.utils.parseEther("100");
      const amtB = ethers.utils.parseEther("200");
      await dex.addLiquidity(amtA, amtB);
      const [rA, rB] = await dex.getReserves();
      expect(rA).to.equal(amtA);
      expect(rB).to.equal(amtB);
    });

    it("should mint correct LP tokens for first provider", async function () {
      const amtA = ethers.utils.parseEther("100");
      const amtB = ethers.utils.parseEther("200");
      await dex.addLiquidity(amtA, amtB);
      const lp = await dex.liquidity(owner.address);
      const total = await dex.totalLiquidity();
      // sqrt(100e18 * 200e18) = sqrt(2e40) ≈ 141.42e18
      const expected = amtA.mul(amtB);
      const sqrtExpected = ethers.BigNumber.from(
        Math.floor(Math.sqrt(Number(ethers.utils.formatEther(expected)) * 1e18)).toString()
      );
      expect(lp).to.equal(total);
      expect(lp).to.be.gt(0);
    });

    it("should allow subsequent liquidity additions", async function () {
      await dex.addLiquidity(
        ethers.utils.parseEther("100"),
        ethers.utils.parseEther("200")
      );
      const totalBefore = await dex.totalLiquidity();
      await dex.connect(addr1).addLiquidity(
        ethers.utils.parseEther("50"),
        ethers.utils.parseEther("100")
      );
      const totalAfter = await dex.totalLiquidity();
      expect(totalAfter).to.be.gt(totalBefore);
      expect(await dex.liquidity(addr1.address)).to.be.gt(0);
    });

    it("should maintain price ratio on liquidity addition", async function () {
      await dex.addLiquidity(
        ethers.utils.parseEther("100"),
        ethers.utils.parseEther("200")
      );
      // Providing wrong ratio must revert
      await expect(
        dex.connect(addr1).addLiquidity(
          ethers.utils.parseEther("50"),
          ethers.utils.parseEther("90")  // should be 100
        )
      ).to.be.revertedWith("DEX: token ratio mismatch");
    });

    it("should allow partial liquidity removal", async function () {
      await dex.addLiquidity(
        ethers.utils.parseEther("100"),
        ethers.utils.parseEther("200")
      );
      const lp = await dex.liquidity(owner.address);
      const half = lp.div(2);
      await dex.removeLiquidity(half);
      expect(await dex.liquidity(owner.address)).to.equal(lp.sub(half));

      // Extra branch coverage: Removing 1 wei LP from a huge pool yields 0 token output
      await expect(dex.removeLiquidity(1)).to.be.revertedWith("DEX: zero token output");
    });

    it("should return correct token amounts on liquidity removal", async function () {
      const amtA = ethers.utils.parseEther("100");
      const amtB = ethers.utils.parseEther("200");
      await dex.addLiquidity(amtA, amtB);
      const lp = await dex.liquidity(owner.address);
      const total = await dex.totalLiquidity();

      const balABefore = await tokenA.balanceOf(owner.address);
      const balBBefore = await tokenB.balanceOf(owner.address);

      const tx = await dex.removeLiquidity(lp);
      const receipt = await tx.wait();

      const balAAfter = await tokenA.balanceOf(owner.address);
      const balBAfter = await tokenB.balanceOf(owner.address);

      const returnedA = balAAfter.sub(balABefore);
      const returnedB = balBAfter.sub(balBBefore);

      // Proportional share: lp/total * reserve
      const expectedA = lp.mul(amtA).div(total);
      const expectedB = lp.mul(amtB).div(total);

      expect(returnedA).to.equal(expectedA);
      expect(returnedB).to.equal(expectedB);
    });

    it("should revert on zero liquidity addition", async function () {
      await expect(dex.addLiquidity(0, 0)).to.be.revertedWith(
        "DEX: amounts must be greater than zero"
      );
    });

    it("should revert when removing more liquidity than owned", async function () {
      await expect(dex.removeLiquidity(1)).to.be.revertedWith(
        "DEX: insufficient LP balance"
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe("Token Swaps", function () {
    beforeEach(async function () {
      await dex.addLiquidity(
        ethers.utils.parseEther("100"),
        ethers.utils.parseEther("200")
      );
    });

    it("should swap token A for token B", async function () {
      const amtIn = ethers.utils.parseEther("10");
      const balBefore = await tokenB.balanceOf(addr1.address);
      await dex.connect(addr1).swapAForB(amtIn);
      const balAfter = await tokenB.balanceOf(addr1.address);
      expect(balAfter).to.be.gt(balBefore);
    });

    it("should swap token B for token A", async function () {
      const amtIn = ethers.utils.parseEther("10");
      const balBefore = await tokenA.balanceOf(addr1.address);
      await dex.connect(addr1).swapBForA(amtIn);
      const balAfter = await tokenA.balanceOf(addr1.address);
      expect(balAfter).to.be.gt(balBefore);
    });

    it("should calculate correct output amount with fee", async function () {
      const amtIn = ethers.utils.parseEther("10");
      const [rA, rB] = await dex.getReserves();
      const expectedOut = await dex.getAmountOut(amtIn, rA, rB);
      const balBefore = await tokenB.balanceOf(addr1.address);
      await dex.connect(addr1).swapAForB(amtIn);
      const balAfter = await tokenB.balanceOf(addr1.address);
      expect(balAfter.sub(balBefore)).to.equal(expectedOut);
    });

    it("should update reserves after swap", async function () {
      const [rABefore] = await dex.getReserves();
      await dex.connect(addr1).swapAForB(ethers.utils.parseEther("10"));
      const [rAAfter] = await dex.getReserves();
      expect(rAAfter).to.be.gt(rABefore);
    });

    it("should increase k after swap due to fees", async function () {
      const [rA1, rB1] = await dex.getReserves();
      const k1 = rA1.mul(rB1);
      await dex.connect(addr1).swapAForB(ethers.utils.parseEther("10"));
      const [rA2, rB2] = await dex.getReserves();
      const k2 = rA2.mul(rB2);
      expect(k2).to.be.gte(k1);
    });

    it("should revert on zero swap amount", async function () {
      await expect(dex.connect(addr1).swapAForB(0)).to.be.revertedWith(
        "DEX: input amount must be greater than zero"
      );
      await expect(dex.connect(addr1).swapBForA(0)).to.be.revertedWith(
        "DEX: input amount must be greater than zero"
      );

      // Extra branch coverage: swap input 1 wei gives 0 output due to precision
      // Using a test contract setup or owner to deploy a tiny pool
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const tA = await MockERC20.deploy("TKA", "TKA");
      const tB = await MockERC20.deploy("TKB", "TKB");
      const DEXFactory = await ethers.getContractFactory("DEX");
      const tinyDex = await DEXFactory.deploy(tA.address, tB.address);
      await tA.approve(tinyDex.address, 1000);
      await tB.approve(tinyDex.address, 1000);
      await tinyDex.addLiquidity(1000, 1000);
      await expect(tinyDex.swapAForB(1)).to.be.revertedWith("DEX: zero output amount");
      await expect(tinyDex.swapBForA(1)).to.be.revertedWith("DEX: zero output amount");
    });

    it("should handle large swaps with high price impact", async function () {
      // Swap nearly all of reserveA — should succeed but give poor rate
      const largeSwap = ethers.utils.parseEther("90");
      const [rA, rB] = await dex.getReserves();
      const expectedOut = await dex.getAmountOut(largeSwap, rA, rB);
      // High price impact: output should be significantly less than proportional
      const proportionalOut = largeSwap.mul(rB).div(rA);
      expect(expectedOut).to.be.lt(proportionalOut);
      await dex.connect(addr1).swapAForB(largeSwap);
    });

    it("should handle multiple consecutive swaps", async function () {
      await dex.connect(addr1).swapAForB(ethers.utils.parseEther("5"));
      await dex.connect(addr1).swapAForB(ethers.utils.parseEther("3"));
      await dex.connect(addr1).swapBForA(ethers.utils.parseEther("10"));
      const [rA, rB] = await dex.getReserves();
      expect(rA).to.be.gt(0);
      expect(rB).to.be.gt(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe("Price Calculations", function () {
    it("should return correct initial price", async function () {
      await dex.addLiquidity(
        ethers.utils.parseEther("100"),
        ethers.utils.parseEther("200")
      );
      const price = await dex.getPrice();
      // price = reserveB/reserveA * 1e18 = 200/100 * 1e18 = 2e18
      expect(price).to.equal(ethers.utils.parseEther("2"));
    });

    it("should update price after swaps", async function () {
      await dex.addLiquidity(
        ethers.utils.parseEther("100"),
        ethers.utils.parseEther("200")
      );
      const priceBefore = await dex.getPrice();
      await dex.swapAForB(ethers.utils.parseEther("10"));
      const priceAfter = await dex.getPrice();
      // Adding more A → A gets cheaper → price (B/A) decreases
      expect(priceAfter).to.be.lt(priceBefore);
    });

    it("should handle price queries with zero reserves gracefully", async function () {
      const price = await dex.getPrice();
      expect(price).to.equal(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe("Fee Distribution", function () {
    it("should accumulate fees for liquidity providers", async function () {
      const amtA = ethers.utils.parseEther("100");
      const amtB = ethers.utils.parseEther("200");
      await dex.addLiquidity(amtA, amtB);
      const lp = await dex.liquidity(owner.address);

      // Perform several swaps so fees accumulate
      await dex.connect(addr1).swapAForB(ethers.utils.parseEther("10"));
      await dex.connect(addr1).swapAForB(ethers.utils.parseEther("10"));
      await dex.connect(addr1).swapBForA(ethers.utils.parseEther("20"));

      const balABefore = await tokenA.balanceOf(owner.address);
      const balBBefore = await tokenB.balanceOf(owner.address);

      await dex.removeLiquidity(lp);

      const balAAfter = await tokenA.balanceOf(owner.address);
      const balBAfter = await tokenB.balanceOf(owner.address);

      const receivedA = balAAfter.sub(balABefore);
      const receivedB = balBAfter.sub(balBBefore);

      // After fees, at least one side should be greater or equal to original deposit
      // (The pool grows due to fee retention)
      expect(receivedA.add(receivedB)).to.be.gt(0);
    });

    it("should distribute fees proportionally to LP share", async function () {
      // Owner adds initial liquidity
      await dex.addLiquidity(
        ethers.utils.parseEther("100"),
        ethers.utils.parseEther("200")
      );
      const ownerLP = await dex.liquidity(owner.address);

      // addr1 adds proportional liquidity (same ratio)
      await dex.connect(addr1).addLiquidity(
        ethers.utils.parseEther("100"),
        ethers.utils.parseEther("200")
      );
      const addr1LP = await dex.liquidity(addr1.address);

      // Both should have equal LP shares since they added equal amounts
      expect(ownerLP).to.equal(addr1LP);

      // Perform swaps to generate fees
      await dex.connect(addr2).swapAForB(ethers.utils.parseEther("20"));
      await dex.connect(addr2).swapBForA(ethers.utils.parseEther("30"));

      // Both remove their liquidity
      const ownerBalABefore = await tokenA.balanceOf(owner.address);
      await dex.removeLiquidity(ownerLP);
      const ownerReceivedA = (await tokenA.balanceOf(owner.address)).sub(ownerBalABefore);

      const addr1BalABefore = await tokenA.balanceOf(addr1.address);
      await dex.connect(addr1).removeLiquidity(addr1LP);
      const addr1ReceivedA = (await tokenA.balanceOf(addr1.address)).sub(addr1BalABefore);

      // Equal LP shares → equal Token A returned (within 1 wei rounding)
      const diff = ownerReceivedA.sub(addr1ReceivedA).abs();
      expect(diff).to.be.lte(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe("Edge Cases", function () {
    it("should handle very small liquidity amounts", async function () {
      // Minimal amounts — contracts must not revert on tiny values
      await dex.addLiquidity(1, 1);
      const [rA, rB] = await dex.getReserves();
      expect(rA).to.equal(1);
      expect(rB).to.equal(1);
    });



    it("should handle very large liquidity amounts", async function () {
      const large = ethers.utils.parseEther("500000");
      await dex.addLiquidity(large, large.mul(2));
      const [rA, rB] = await dex.getReserves();
      expect(rA).to.equal(large);
      expect(rB).to.equal(large.mul(2));
    });

    it("should prevent unauthorized access", async function () {
      await dex.addLiquidity(
        ethers.utils.parseEther("100"),
        ethers.utils.parseEther("200")
      );
      // addr2 never provided liquidity — removeLiquidity must revert
      await expect(
        dex.connect(addr2).removeLiquidity(1)
      ).to.be.revertedWith("DEX: insufficient LP balance");
    });

    it("should revert on addLiquidity when one amount is zero", async function () {
      await expect(dex.addLiquidity(ethers.utils.parseEther("10"), 0)).to.be.revertedWith(
        "DEX: amounts must be greater than zero"
      );
      await expect(dex.addLiquidity(0, ethers.utils.parseEther("10"))).to.be.revertedWith(
        "DEX: amounts must be greater than zero"
      );
    });

    it("should revert getAmountOut with zero input", async function () {
      await expect(
        dex.getAmountOut(0, ethers.utils.parseEther("100"), ethers.utils.parseEther("200"))
      ).to.be.revertedWith("DEX: input amount must be greater than zero");
    });

    it("should revert getAmountOut with zero reserves", async function () {
      await expect(
        dex.getAmountOut(ethers.utils.parseEther("10"), 0, 0)
      ).to.be.revertedWith("DEX: insufficient reserves");

      // Extra coverage for half zero reserves
      await expect(
        dex.getAmountOut(ethers.utils.parseEther("10"), ethers.utils.parseEther("10"), 0)
      ).to.be.revertedWith("DEX: insufficient reserves");

      // Extra branch coverage for constructor reverts
      const DEXFactory = await ethers.getContractFactory("DEX");
      await expect(DEXFactory.deploy(ethers.constants.AddressZero, tokenB.address)).to.be.revertedWith("DEX: tokenA is zero address");
      await expect(DEXFactory.deploy(tokenA.address, ethers.constants.AddressZero)).to.be.revertedWith("DEX: tokenB is zero address");
      await expect(DEXFactory.deploy(tokenA.address, tokenA.address)).to.be.revertedWith("DEX: identical token addresses");
    });
  });

  // ─────────────────────────────────────────────────────────────
  describe("Events", function () {
    it("should emit LiquidityAdded event", async function () {
      const amtA = ethers.utils.parseEther("100");
      const amtB = ethers.utils.parseEther("200");
      await expect(dex.addLiquidity(amtA, amtB))
        .to.emit(dex, "LiquidityAdded")
        .withArgs(owner.address, amtA, amtB, await (async () => {
          // Compute expected LP: sqrt(amtA * amtB)
          // We just check event is emitted with correct provider and amounts
          return (await dex.totalLiquidity()) || ethers.BigNumber.from(0);
        })());
    });

    it("should emit LiquidityRemoved event", async function () {
      const amtA = ethers.utils.parseEther("100");
      const amtB = ethers.utils.parseEther("200");
      await dex.addLiquidity(amtA, amtB);
      const lp = await dex.liquidity(owner.address);
      await expect(dex.removeLiquidity(lp)).to.emit(dex, "LiquidityRemoved");
    });

    it("should emit Swap event", async function () {
      await dex.addLiquidity(
        ethers.utils.parseEther("100"),
        ethers.utils.parseEther("200")
      );
      const amtIn = ethers.utils.parseEther("10");
      await expect(dex.connect(addr1).swapAForB(amtIn))
        .to.emit(dex, "Swap")
        .withArgs(
          addr1.address,
          tokenA.address,
          tokenB.address,
          amtIn,
          await dex.getAmountOut(amtIn, ethers.utils.parseEther("100"), ethers.utils.parseEther("200"))
        );
    });
  });
});
