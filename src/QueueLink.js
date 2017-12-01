"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
exports.__esModule = true;
var apollo_link_1 = require("apollo-link");
var QueueLink = /** @class */ (function (_super) {
    __extends(QueueLink, _super);
    function QueueLink() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.opQueue = [];
        _this.isOpen = true;
        return _this;
    }
    QueueLink.prototype.open = function () {
        this.isOpen = true;
        this.opQueue.forEach(function (_a) {
            var operation = _a.operation, forward = _a.forward, observer = _a.observer;
            forward(operation).subscribe(observer);
        });
        this.opQueue = [];
    };
    QueueLink.prototype.close = function () {
        this.isOpen = false;
    };
    QueueLink.prototype.request = function (operation, forward) {
        var _this = this;
        if (this.isOpen) {
            return forward(operation);
        }
        return new apollo_link_1.Observable(function (observer) {
            _this.enqueue({ operation: operation, forward: forward, observer: observer });
            return function () { return _this.cancelOperation({ operation: operation, forward: forward, observer: observer }); };
        });
    };
    QueueLink.prototype.cancelOperation = function (entry) {
        this.opQueue = this.opQueue.filter(function (e) { return e !== entry; });
    };
    QueueLink.prototype.enqueue = function (entry) {
        this.opQueue.push(entry);
    };
    return QueueLink;
}(apollo_link_1.ApolloLink));
exports["default"] = QueueLink;
