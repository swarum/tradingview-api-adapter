export function generateRandomString(length: number): string {
    let randomString = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i += 1) randomString += characters.charAt(Math.floor(Math.random() * characters.length));

    return randomString;
}
