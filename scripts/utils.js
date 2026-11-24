function inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function isEmpty(position, r, c) {
    return inBounds(r, c) && position.pieceAt(r, c) === null;
}

function isEnemy(position, r, c, color) {
    if (!inBounds(r, c)) return false;
    const p = position.pieceAt(r, c);
    return p && p[0] !== color;
}

function isFriend(position, r, c, color) {
    if (!inBounds(r, c)) return false;
    const p = position.pieceAt(r, c);
    return p && p[0] === color;
}

function squareIsAttacked(position, r, c, byColor, getMoves) {
    const enemy = byColor;

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = position.pieceAt(row, col);
            if (!piece || piece[0] !== enemy) continue;

            if (piece[1] === "P") {
                const pawnAttackRow = row + (enemy === "w" ? -1 : 1);
                if (pawnAttackRow === r && Math.abs(col - c) === 1) return true;
                continue;
            }

            const moves = getMoves(row, col, true);

            if (moves.some(m => m.r === r && m.c === c)) {
                return true;
            }
        }
    }

    return false;
}

export { inBounds, isEmpty, isEnemy, isFriend, squareIsAttacked };