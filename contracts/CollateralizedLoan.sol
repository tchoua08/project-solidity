// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract CollateralizedLoan {
    enum LoanStatus {
        Requested,
        Funded,
        Repaid,
        Defaulted
    }

    struct Loan {
        uint id;
        address payable borrower;
        address payable lender;
        uint collateralAmount;
        uint loanAmount;
        uint interestAmount;
        uint repaymentAmount;
        uint dueDate;
        uint fundedAt;
        LoanStatus status;
    }

    uint public loanCount;
    mapping(uint => Loan) public loans;

    bool private locked;

    event LoanRequested(
        uint indexed loanId,
        address indexed borrower,
        uint collateralAmount,
        uint loanAmount,
        uint interestAmount,
        uint dueDate
    );
    event LoanFunded(uint indexed loanId, address indexed lender, uint loanAmount);
    event LoanRepaid(uint indexed loanId, address indexed borrower, uint repaymentAmount);
    event CollateralClaimed(uint indexed loanId, address indexed lender, uint collateralAmount);

    modifier noReentrant() {
        require(!locked, "No re-entrancy");
        locked = true;
        _;
        locked = false;
    }

    modifier loanExists(uint _loanId) {
        require(_loanId > 0 && _loanId <= loanCount, "Loan does not exist");
        _;
    }

    modifier onlyBorrower(uint _loanId) {
        require(msg.sender == loans[_loanId].borrower, "Only the borrower can perform this action");
        _;
    }

    modifier onlyLender(uint _loanId) {
        require(msg.sender == loans[_loanId].lender, "Only the lender can perform this action");
        _;
    }

    modifier inStatus(uint _loanId, LoanStatus _status) {
        require(loans[_loanId].status == _status, "Invalid loan status");
        _;
    }

    function requestLoan(
        uint _loanAmount,
        uint _interestAmount,
        uint _duration
    ) public payable returns (uint) {
        require(msg.value > 0, "Collateral must be greater than 0");
        require(_loanAmount > 0, "Loan amount must be greater than 0");
        require(_duration > 0, "Loan duration must be greater than 0");

        loanCount += 1;
        uint loanId = loanCount;
        uint repaymentAmount = _loanAmount + _interestAmount;
        uint dueDate = block.timestamp + _duration;

        loans[loanId] = Loan({
            id: loanId,
            borrower: payable(msg.sender),
            lender: payable(address(0)),
            collateralAmount: msg.value,
            loanAmount: _loanAmount,
            interestAmount: _interestAmount,
            repaymentAmount: repaymentAmount,
            dueDate: dueDate,
            fundedAt: 0,
            status: LoanStatus.Requested
        });

        emit LoanRequested(loanId, msg.sender, msg.value, _loanAmount, _interestAmount, dueDate);
        return loanId;
    }

    function fundLoan(uint _loanId)
        public
        payable
        noReentrant
        loanExists(_loanId)
        inStatus(_loanId, LoanStatus.Requested)
    {
        Loan storage loan = loans[_loanId];
        require(msg.sender != loan.borrower, "Borrower cannot fund their own loan");
        require(msg.value == loan.loanAmount, "Incorrect loan funding amount");

        loan.lender = payable(msg.sender);
        loan.fundedAt = block.timestamp;
        loan.status = LoanStatus.Funded;

        (bool sent, ) = loan.borrower.call{value: msg.value}("");
        require(sent, "Failed to send loan amount");

        emit LoanFunded(_loanId, msg.sender, msg.value);
    }

    function repayLoan(uint _loanId)
        public
        payable
        noReentrant
        loanExists(_loanId)
        onlyBorrower(_loanId)
        inStatus(_loanId, LoanStatus.Funded)
    {
        Loan storage loan = loans[_loanId];
        require(block.timestamp <= loan.dueDate, "Loan is past due");
        require(msg.value == loan.repaymentAmount, "Incorrect repayment amount");

        loan.status = LoanStatus.Repaid;

        (bool paidLender, ) = loan.lender.call{value: msg.value}("");
        require(paidLender, "Failed to repay lender");

        (bool returnedCollateral, ) = loan.borrower.call{value: loan.collateralAmount}("");
        require(returnedCollateral, "Failed to return collateral");

        emit LoanRepaid(_loanId, msg.sender, msg.value);
    }

    function claimCollateral(uint _loanId)
        public
        noReentrant
        loanExists(_loanId)
        onlyLender(_loanId)
        inStatus(_loanId, LoanStatus.Funded)
    {
        Loan storage loan = loans[_loanId];
        require(block.timestamp > loan.dueDate, "Loan is not past due");

        uint collateralAmount = loan.collateralAmount;
        loan.status = LoanStatus.Defaulted;

        (bool sent, ) = loan.lender.call{value: collateralAmount}("");
        require(sent, "Failed to send collateral");

        emit CollateralClaimed(_loanId, msg.sender, collateralAmount);
    }

    function getLoan(uint _loanId) public view loanExists(_loanId) returns (Loan memory) {
        return loans[_loanId];
    }
}
