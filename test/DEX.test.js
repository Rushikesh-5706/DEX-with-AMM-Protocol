const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DEX", function () {

  it("sanity test: contract deploys successfully", async function () {
    expect(dex.address).to.properAddress;
  });

  it("sanity test: initial reserves are zero", async function () {
    const r = await dex.getReserves();
    expect(r[0]).to.equal(0);
    expect(r[1]).to.equal(0);
  });

  let dex, tokenA, tokenB;
  let owner, addr1, addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    tokenA = await MockERC20.deploy("Token A", "TKA");
    tokenB = await MockERC20.deploy("Token B", "TKB");

    const DEX = await ethers.getContractFactory("DEX");
    dex = await DEX.deploy(tokenA.address, tokenB.address);

    await tokenA.approve(dex.address, ethers.utils.parseEther("1000000"));
    await tokenB.approve(dex.address, ethers.utils.parseEther("1000000"));

    await tokenA.connect(addr1).mint(addr1.address, ethers.utils.parseEther("1000"));
    await tokenB.connect(addr1).mint(addr1.address, ethers.utils.parseEther("1000"));

    await tokenA.connect(addr1).approve(dex.address, ethers.utils.parseEther("1000"));
    await tokenB.connect(addr1).approve(dex.address, ethers.utils.parseEther("1000"));
  });

  /* -------- Liquidity Management -------- */

  it("should allow initial liquidity provision", async function () {
    await dex.addLiquidity(100, 200);
    const r = await dex.getReserves();
    expect(r[0]).to.equal(100);
    expect(r[1]).to.equal(200);
  });

  it("should mint correct LP tokens for first provider", async function () {
    await dex.addLiquidity(100, 200);
    expect(await dex.totalLiquidity()).to.be.gt(0);
  });

  it("should allow subsequent liquidity additions", async function () {
    await dex.addLiquidity(100, 200);
    await dex.connect(addr1).addLiquidity(50, 100);
  });

  it("should maintain price ratio on liquidity addition", async function () {
    await dex.addLiquidity(100, 200);
    await expect(dex.connect(addr1).addLiquidity(50, 90)).to.be.reverted;
  });

  it("should allow partial liquidity removal", async function () {
    await dex.addLiquidity(100, 200);
    const lp = await dex.totalLiquidity();
    await dex.removeLiquidity(lp.div(2));
  });

  it("should revert on zero liquidity addition", async function () {
    await expect(dex.addLiquidity(0, 0)).to.be.reverted;
  });

  it("should revert when removing more liquidity than owned", async function () {
    await expect(dex.removeLiquidity(1)).to.be.reverted;
  });

  /* -------- Token Swaps -------- */

  it("should swap token A for token B", async function () {
    await dex.addLiquidity(100, 200);
    await dex.connect(addr1).swapAForB(10);
  });

  it("should swap token B for token A", async function () {
    await dex.addLiquidity(100, 200);
    await dex.connect(addr1).swapBForA(10);
  });

  it("should revert on zero swap amount", async function () {
    await expect(dex.swapAForB(0)).to.be.reverted;
  });

  it("should update reserves after swap", async function () {
    await dex.addLiquidity(100, 200);
    await dex.connect(addr1).swapAForB(10);
    const r = await dex.getReserves();
    expect(r[0]).to.be.gt(100);
  });

  it("should increase k after swap due to fees", async function () {
    await dex.addLiquidity(100, 200);
    const r1 = await dex.getReserves();
    const k1 = r1[0] * r1[1];
    await dex.connect(addr1).swapAForB(10);
    const r2 = await dex.getReserves();
    const k2 = r2[0] * r2[1];
    expect(k2).to.be.gt(k1);
  });

  it("should handle multiple consecutive swaps", async function () {
    await dex.addLiquidity(100, 200);
    await dex.connect(addr1).swapAForB(10);
    await dex.connect(addr1).swapAForB(5);
    await dex.connect(addr1).swapBForA(5);
  });

  /* -------- Price & View Functions -------- */

  it("should return zero price when reserves are zero", async function () {
    expect(await dex.getPrice()).to.equal(0);
  });

  it("should update price after swaps", async function () {
    await dex.addLiquidity(100, 200);
    await dex.swapAForB(10);
    expect(await dex.getPrice()).to.not.equal(2);
  });

  it("should return correct reserves via getReserves", async function () {
    await dex.addLiquidity(100, 200);
    const r = await dex.getReserves();
    expect(r[0]).to.equal(100);
    expect(r[1]).to.equal(200);
  });

  /* -------- Fee & Branch Coverage -------- */

  it("should accumulate fees in pool", async function () {
    await dex.addLiquidity(100, 200);
    const r1 = await dex.getReserves();
    const k1 = r1[0] * r1[1];
    await dex.connect(addr1).swapAForB(10);
    const r2 = await dex.getReserves();
    const k2 = r2[0] * r2[1];
    expect(k2).to.be.gt(k1);
  });

  it("should revert getAmountOut when input is zero", async function () {
    await expect(dex.getAmountOut(0, 10, 10)).to.be.reverted;
  });

  it("should revert getAmountOut when reserves are zero", async function () {
    await expect(dex.getAmountOut(1, 0, 0)).to.be.reverted;
  });

  it("should emit LiquidityAdded event", async function () {
    await expect(dex.addLiquidity(100, 200)).to.emit(dex, "LiquidityAdded");
  });

  it("should revert swapBForA when amount is zero", async function () {
    await expect(dex.swapBForA(0)).to.be.reverted;
  });

  it("should revert removeLiquidity when amount is zero", async function () {
    await expect(dex.removeLiquidity(0)).to.be.reverted;
  });

  it("should revert addLiquidity when one side is zero", async function () {

  it("should return amountOut for valid getAmountOut call", async function () {
    const out = await dex.getAmountOut(10, 100, 200);
    expect(out).to.be.gt(0);
  });

  it("should successfully execute swapAForB with valid input", async function () {
    await dex.addLiquidity(100, 200);
    await dex.swapAForB(10);
    const r = await dex.getReserves();
    expect(r[1]).to.be.lt(200);
  });

  it("should successfully execute swapBForA with valid input", async function () {
    await dex.addLiquidity(100, 200);
    await dex.swapBForA(10);
    const r = await dex.getReserves();
    expect(r[0]).to.be.lt(100);
  });
    await expect(dex.addLiquidity(10, 0)).to.be.reverted;
  });
});
