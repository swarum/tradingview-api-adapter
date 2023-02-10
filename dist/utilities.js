"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateRandomString = void 0;
function generateRandomString(length) {
    let randomString = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i += 1)
        randomString += characters.charAt(Math.floor(Math.random() * characters.length));
    return randomString;
}
exports.generateRandomString = generateRandomString;
//# sourceMappingURL=utilities.js.map