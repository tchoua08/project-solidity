const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CollateralizedLoan", function () {
  async function deployCollateralizedLoanFixture() {
    const [owner, borrower, lender, otherAccount] = await ethers.getSigners();
    const CollateralizedLoan = await ethers.getContractFactory(
      "CollateralizedLoan"
    );
    const collateralizedLoan = await CollateralizedLoan.deploy();

    return { collateralizedLoan, owner, borrower, lender, otherAccount };
  }

  async function requestedLoanFixture() {
    const context = await deployCollateralizedLoanFixture();
    const { collateralizedLoan, borrower } = context;

    const loanAmount = ethers.parseEther("1");
    const interestAmount = ethers.parseEther("0.1");
    const collateralAmount = ethers.parseEther("2");
    const duration = 7 * 24 * 60 * 60;

    await collateralizedLoan
      .connect(borrower)
      .requestLoan(loanAmount, interestAmount, duration, {
        value: collateralAmount,
      });

    return {
      ...context,
      loanAmount,
      interestAmount,
      collateralAmount,
      repaymentAmount: loanAmount + interestAmount,
      duration,
    };
  }

  async function fundedLoanFixture() {
    const context = await requestedLoanFixture();
    const { collateralizedLoan, lender, loanAmount } = context;

    await collateralizedLoan.connect(lender).fundLoan(0, {
      value: loanAmount,
    });

    return context;
  }

  describe("Deployment", function () {
    it("Should deploy the contract locally", async function () {
      const { collateralizedLoan } = await loadFixture(
        deployCollateralizedLoanFixture
      );

      expect(await collateralizedLoan.getAddress()).to.properAddress;
      expect(await collateralizedLoan.nextLoanId()).to.equal(0);
    });
  });

  describe("Loan requests", function () {
    it("Should allow a borrower to deposit collateral and request a loan", async function () {
      const {
        collateralizedLoan,
        borrower,
        loanAmount,
        interestAmount,
        collateralAmount,
        duration,
      } = await loadFixture(requestedLoanFixture);

      const loan = await collateralizedLoan.getLoan(0);

      expect(loan.id).to.equal(0);
      expect(loan.borrower).to.equal(borrower.address);
      expect(loan.collateralAmount).to.equal(collateralAmount);
      expect(loan.loanAmount).to.equal(loanAmount);
      expect(loan.interestAmount).to.equal(interestAmount);
      expect(loan.repaymentAmount).to.equal(loanAmount + interestAmount);
      expect(loan.dueDate).to.be.greaterThan(duration);
      expect(loan.status).to.equal(0);
      expect(await collateralizedLoan.nextLoanId()).to.equal(1);
    });

    it("Should emit a loan request event", async function () {
      const { collateralizedLoan, borrower } = await loadFixture(
        deployCollateralizedLoanFixture
      );

      const loanAmount = ethers.parseEther("1");
      const interestAmount = ethers.parseEther("0.1");
      const collateralAmount = ethers.parseEther("2");
      const duration = 7 * 24 * 60 * 60;

      await expect(
        collateralizedLoan
          .connect(borrower)
          .requestLoan(loanAmount, interestAmount, duration, {
            value: collateralAmount,
          })
      )
        .to.emit(collateralizedLoan, "LoanRequested")
        .withArgs(
          0,
          borrower.address,
          collateralAmount,
          loanAmount,
          interestAmount,
          anyValue
        );
    });
  });

  describe("Loan funding", function () {
    it("Should allow a lender to fund a requested loan", async function () {
      const { collateralizedLoan, lender, loanAmount } = await loadFixture(
        requestedLoanFixture
      );

      await expect(
        collateralizedLoan.connect(lender).fundLoan(0, { value: loanAmount })
      )
        .to.emit(collateralizedLoan, "LoanFunded")
        .withArgs(0, lender.address, loanAmount);

      const loan = await collateralizedLoan.getLoan(0);
      expect(loan.lender).to.equal(lender.address);
      expect(loan.status).to.equal(1);
    });

    it("Should reject incorrect funding scenarios", async function () {
      const { collateralizedLoan, borrower, lender } = await loadFixture(
        requestedLoanFixture
      );

      await expect(
        collateralizedLoan
          .connect(borrower)
          .fundLoan(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Borrower cannot fund their own loan");

      await expect(
        collateralizedLoan
          .connect(lender)
          .fundLoan(0, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("Incorrect loan funding amount");
    });
  });

  describe("Loan repayment", function () {
    it("Should let the borrower repay with interest and receive the collateral back", async function () {
      const {
        collateralizedLoan,
        borrower,
        lender,
        repaymentAmount,
        collateralAmount,
      } = await loadFixture(fundedLoanFixture);

      const lenderBalanceBefore = await ethers.provider.getBalance(
        lender.address
      );

      const transaction = await collateralizedLoan.connect(borrower).repayLoan(0, {
        value: repaymentAmount,
      });

      await expect(transaction)
        .to.emit(collateralizedLoan, "LoanRepaid")
        .withArgs(0, borrower.address, repaymentAmount);

      const lenderBalanceAfter = await ethers.provider.getBalance(
        lender.address
      );
      const contractBalance = await ethers.provider.getBalance(
        await collateralizedLoan.getAddress()
      );
      expect(lenderBalanceAfter - lenderBalanceBefore).to.equal(
        repaymentAmount
      );
      expect(contractBalance).to.equal(0);

      const loan = await collateralizedLoan.getLoan(0);
      expect(loan.status).to.equal(2);
    });

    it("Should reject incorrect repayment scenarios", async function () {
      const { collateralizedLoan, borrower, otherAccount } = await loadFixture(
        fundedLoanFixture
      );

      await expect(
        collateralizedLoan.connect(otherAccount).repayLoan(0, {
          value: ethers.parseEther("1.1"),
        })
      ).to.be.revertedWith("Only the borrower can perform this action");

      await expect(
        collateralizedLoan.connect(borrower).repayLoan(0, {
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWith("Incorrect repayment amount");
    });
  });

  describe("Collateral claims", function () {
    it("Should allow the lender to claim collateral after default", async function () {
      const { collateralizedLoan, lender, collateralAmount, duration } =
        await loadFixture(fundedLoanFixture);

      await time.increase(duration + 1);

      const transaction = await collateralizedLoan
        .connect(lender)
        .claimCollateral(0);

      await expect(transaction)
        .to.emit(collateralizedLoan, "CollateralClaimed")
        .withArgs(0, lender.address, collateralAmount);

      const contractBalance = await ethers.provider.getBalance(
        await collateralizedLoan.getAddress()
      );
      expect(contractBalance).to.equal(0);

      const loan = await collateralizedLoan.getLoan(0);
      expect(loan.status).to.equal(3);
    });

    it("Should reject a premature collateral claim", async function () {
      const { collateralizedLoan, lender } = await loadFixture(
        fundedLoanFixture
      );

      await expect(
        collateralizedLoan.connect(lender).claimCollateral(0)
      ).to.be.revertedWith("Loan is not past due");
    });
  });
});
