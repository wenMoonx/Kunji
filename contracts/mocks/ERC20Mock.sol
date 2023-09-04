// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./ERC20CustomInherits.sol";

contract ERC20Mock is ERC20CustomInherits {
    uint8 private _decimals;
    bool returnBoolValue = true;
    bool needToReturnValue = true;
    bool isSafeApprove = false;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20CustomInherits(name_, symbol_) {
        _decimals = decimals_;
    }

    function setDecimals(uint8 value) external {
        _decimals = value;
    }

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function burnFrom(address account, uint256 amount) public {
        _burn(account, amount);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function setReturnBoolValue(bool _value) external {
        returnBoolValue = _value;
    }

    function setNeedToReturnValue(bool _value) external {
        needToReturnValue = _value;
    }

    function setIsSafeApprove(bool _value) external {
        isSafeApprove = _value;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        if (needToReturnValue && !returnBoolValue) return false;

        super.transferFrom(sender, recipient, amount);

        if (!needToReturnValue) {
            assembly {
                return(0, 0)
            }
        }

        return true;
    }

    function transfer(
        address recipient,
        uint256 amount
    ) public virtual override returns (bool) {
        if (needToReturnValue && !returnBoolValue) return false;

        super.transfer(recipient, amount);

        if (!needToReturnValue) {
            assembly {
                return(0, 0)
            }
        }

        return true;
    }

    function approve(
        address recipient,
        uint256 amount
    ) public override returns (bool) {
        if (needToReturnValue && !returnBoolValue) return false;

        if (
            needToReturnValue &&
            isSafeApprove &&
            amount != 0 &&
            allowance(msg.sender, recipient) != 0
        ) {
            return false;
        }

        super.approve(recipient, amount);

        if (!needToReturnValue) {
            assembly {
                return(0, 0)
            }
        }

        return true;
    }

    function mockBalanceOf(address _account, uint256 newBalance) external {
        _balances[_account] = newBalance;
    }
}
