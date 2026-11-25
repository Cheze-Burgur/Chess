import ChessPosition from "./position.js";
import {
    inBounds,
    isEmpty,
    isEnemy,
    isFriend,
    squareIsAttacked
} from "./utils.js";

let state = null;

function configureMoveState(nextState) {
    state = nextState;
}

function getPosition() {
    if (!state) throw new Error("Move state has not been configured");
    return state.getPosition();
}

function toAlgebraic(r, c) {
    const files = "abcdefgh";
    return files[c] + (8 - r);
}

function getMoves(r, c, forAttack = false) {
    const position = getPosition();
    const piece = position.pieceAt(r, c);
    if (!piece) return [];

    switch (piece[1]) {
        case "P": return getPawnMoves(r, c);
        case "R": return getRookMoves(r, c);
        case "N": return getKnightMoves(r, c);
        case "B": return getBishopMoves(r, c);
        case "Q": return getQueenMoves(r, c);
        case "K": return getKingMoves(r, c, forAttack);
        default: return [];
    }
}

function getPawnMoves(r, c) {
    const position = getPosition();
    const piece = position.pieceAt(r, c);
    const color = piece[0];
    const dir = color === "w" ? -1 : 1;
    const startRow = color === "w" ? 6 : 1;
    const moves = [];

    if (isEmpty(position, r + dir, c)) {
        moves.push({ r: r + dir, c });
    }

    if (r === startRow &&
        isEmpty(position, r + dir, c) &&
        isEmpty(position, r + 2 * dir, c)) {
        moves.push({ r: r + 2 * dir, c });
    }

    for (const dc of [-1, 1]) {
        if (isEnemy(position, r + dir, c + dc, color)) {
            moves.push({ r: r + dir, c: c + dc });
        } else if (position.enPassantSquare ===
            ChessPosition.squareIndex(r + dir, c + dc)) {
            moves.push({ r: r + dir, c: c + dc, enPassant: true });
        }
    }

    return moves;
}

function getRookMoves(r, c) {
    return rayMoves(r, c,
        [[1, 0], [-1, 0], [0, 1], [0, -1]],
        getPosition().pieceAt(r, c)[0]);
}

function getKnightMoves(r, c) {
    const position = getPosition();
    const color = position.pieceAt(r, c)[0];
    const moves = [];
    const jumps = [
        [2, 1], [2, -1], [-2, 1], [-2, -1],
        [1, 2], [1, -2], [-1, 2], [-1, -2]
    ];

    for (const [dr, dc] of jumps) {
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        if (!isFriend(position, nr, nc, color)) {
            moves.push({ r: nr, c: nc });
        }
    }

    return moves;
}

function getBishopMoves(r, c) {
    return rayMoves(r, c,
        [[1, 1], [1, -1], [-1, 1], [-1, -1]],
        getPosition().pieceAt(r, c)[0]);
}

function getQueenMoves(r, c) {
    return [
        ...getRookMoves(r, c),
        ...getBishopMoves(r, c)
    ];
}

function getKingMoves(r, c, forAttack = false) {
    const position = getPosition();
    const color = position.pieceAt(r, c)[0];
    const moves = [];

    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (!inBounds(nr, nc)) continue;
            if (!isFriend(position, nr, nc, color)) {
                moves.push({ r: nr, c: nc });
            }
        }
    }

    if (!forAttack) {
        const homeRow = color === "w" ? 7 : 0;
        const enemy = color === "w" ? "b" : "w";
        if (r === homeRow && c === 4) {
            if (position.canCastle(color, "kingSide") &&
                position.pieceAt(homeRow, 7) === color + "R" &&
                isEmpty(position, homeRow, 5) &&
                isEmpty(position, homeRow, 6) &&
                !squareIsAttacked(position, homeRow, 4, enemy, getMoves) &&
                !squareIsAttacked(position, homeRow, 5, enemy, getMoves) &&
                !squareIsAttacked(position, homeRow, 6, enemy, getMoves)) {
                moves.push({ r: homeRow, c: 6, castle: "ks" });
            }
            if (position.canCastle(color, "queenSide") &&
                position.pieceAt(homeRow, 0) === color + "R" &&
                isEmpty(position, homeRow, 1) &&
                isEmpty(position, homeRow, 2) &&
                isEmpty(position, homeRow, 3) &&
                !squareIsAttacked(position, homeRow, 4, enemy, getMoves) &&
                !squareIsAttacked(position, homeRow, 3, enemy, getMoves) &&
                !squareIsAttacked(position, homeRow, 2, enemy, getMoves)) {
                moves.push({ r: homeRow, c: 2, castle: "qs" });
            }
        }
    }

    return moves;
}

function rayMoves(r, c, dirs, color) {
    const position = getPosition();
    const moves = [];

    for (const [dr, dc] of dirs) {
        let nr = r + dr;
        let nc = c + dc;
        while (inBounds(nr, nc)) {
            if (isEmpty(position, nr, nc)) {
                moves.push({ r: nr, c: nc });
            } else {
                if (isEnemy(position, nr, nc, color)) {
                    moves.push({ r: nr, c: nc });
                }
                break;
            }
            nr += dr;
            nc += dc;
        }
    }

    return moves;
}

function findKing(position, color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (position.pieceAt(r, c) === color + "K") return { r, c };
        }
    }
    return null;
}

function getMovesOnPosition(position, r, c, forAttack = false) {
    const original = state.getPosition;
    state.getPosition = () => position;
    try {
        return getMoves(r, c, forAttack);
    } finally {
        state.getPosition = original;
    }
}

function isKingInCheckOnPosition(position, color) {
    const king = findKing(position, color);
    if (!king) return false;
    const enemy = color === "w" ? "b" : "w";
    return squareIsAttacked(position, king.r, king.c, enemy,
        (r, c, forAttack) => getMovesOnPosition(position, r, c, forAttack));
}

function isKingInCheck(color) {
    return isKingInCheckOnPosition(getPosition(), color);
}

function moveLeavesKingInCheck(fromR, fromC, move) {
    const snapshot = getPosition().clone();
    const piece = snapshot.pieceAt(fromR, fromC);
    snapshot.setPieceAt(fromR, fromC, null);
    snapshot.setPieceAt(move.r, move.c, piece);

    if (move.enPassant) {
        const dir = piece[0] === "w" ? 1 : -1;
        snapshot.setPieceAt(move.r + dir, move.c, null);
    }

    if (move.castle && piece[1] === "K") {
        if (move.c === 6) {
            snapshot.setPieceAt(move.r, 5, snapshot.pieceAt(move.r, 7));
            snapshot.setPieceAt(move.r, 7, null);
        } else if (move.c === 2) {
            snapshot.setPieceAt(move.r, 3, snapshot.pieceAt(move.r, 0));
            snapshot.setPieceAt(move.r, 0, null);
        }
    }

    return isKingInCheckOnPosition(snapshot, piece[0]);
}

function filterLegalMoves(r, c, moves) {
    const position = getPosition();
    const piece = position.pieceAt(r, c);
    const enemyKing = (piece[0] === "w" ? "b" : "w") + "K";
    return moves.filter(move =>
        position.pieceAt(move.r, move.c) !== enemyKing &&
        !moveLeavesKingInCheck(r, c, move));
}

function playerHasLegalMoves(color) {
    const position = getPosition();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = position.pieceAt(r, c);
            if (!piece || piece[0] !== color) continue;
            if (filterLegalMoves(r, c, getMoves(r, c)).length > 0) return true;
        }
    }
    return false;
}

function getMoveNotation(fromR, fromC, toR, toC, moveMeta, wasCapture) {
    const piece = getPosition().pieceAt(fromR, fromC);
    const pieceType = piece[1];
    const targetSquare = toAlgebraic(toR, toC);

    if (moveMeta?.castle === "ks") return "O-O";
    if (moveMeta?.castle === "qs") return "O-O-O";

    let notation = "";
    if (pieceType !== "P") notation += pieceType;
    if (pieceType === "P" && wasCapture) {
        notation += toAlgebraic(fromR, fromC)[0];
    }
    if (wasCapture) notation += "x";
    notation += targetSquare;
    if (moveMeta?.promotion) {
        notation += "=" + moveMeta.promotion.toUpperCase();
    }
    return notation;
}

function getAllLegalMoves(color) {
    const position = getPosition();
    const moves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = position.pieceAt(r, c);
            if (!piece || piece[0] !== color) continue;
            for (const move of filterLegalMoves(r, c, getMoves(r, c))) {
                moves.push({
                    fromR: r,
                    fromC: c,
                    toR: move.r,
                    toC: move.c,
                    meta: move
                });
            }
        }
    }
    return moves;
}

function simulateMove(currentPosition, move) {
    const copy = currentPosition.clone();
    const piece = copy.pieceAt(move.fromR, move.fromC);
    const movedPiece = piece[1] === "P" &&
        ((piece[0] === "w" && move.toR === 0) ||
            (piece[0] === "b" && move.toR === 7))
        ? piece[0] + "Q"
        : piece;

    copy.setPieceAt(move.fromR, move.fromC, null);
    copy.setPieceAt(move.toR, move.toC, movedPiece);

    if (move.meta.enPassant) {
        const dir = piece[0] === "w" ? 1 : -1;
        copy.setPieceAt(move.toR + dir, move.toC, null);
    }
    if (move.meta.castle) {
        const rookFrom = move.toC === 6 ? 7 : 0;
        const rookTo = move.toC === 6 ? 5 : 3;
        copy.setPieceAt(move.toR, rookTo, copy.pieceAt(move.toR, rookFrom));
        copy.setPieceAt(move.toR, rookFrom, null);
    }
    return copy;
}

const pieceValue = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 100 };

function evaluateBoard(currentPosition) {
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = currentPosition.pieceAt(r, c);
            if (!piece) continue;
            const value = pieceValue[piece[1]];
            score += piece[0] === "b" ? value : -value;
        }
    }
    return score;
}

function chooseBotMove(color) {
    const position = getPosition();
    let bestMove = null;
    let bestScore = -Infinity;

    for (const move of getAllLegalMoves(color)) {
        const score = evaluateBoard(simulateMove(position, move));
        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }
    return bestMove;
}

function performMove(fromR, fromC, toR, toC, moveMeta) {
    const position = getPosition();
    const captured = state.getCaptured();
    const moveHistory = state.getMoveHistory();
    const movingPiece = position.pieceAt(fromR, fromC);
    const targetPiece = position.pieceAt(toR, toC);
    let capturedPiece = targetPiece;

    if (moveMeta?.enPassant) {
        const dir = movingPiece[0] === "w" ? 1 : -1;
        capturedPiece = position.pieceAt(toR + dir, toC);
        position.setPieceAt(toR + dir, toC, null);
    }

    if (movingPiece[1] === "P" &&
        ((movingPiece[0] === "w" && toR === 0) ||
            (movingPiece[0] === "b" && toR === 7))) {
        if (capturedPiece) captured[capturedPiece[0]].push(capturedPiece);
        const notation = getMoveNotation(
            fromR, fromC, toR, toC, moveMeta, !!capturedPiece);
        position.setPieceAt(fromR, fromC, null);
        position.setPieceAt(toR, toC, movingPiece);
        position.recordMove(movingPiece, fromR, fromC, toR, toC, capturedPiece, false);
        moveHistory.push(notation);
        state.setPendingPromotion({ r: toR, c: toC, color: movingPiece[0] });
        state.ui.renderMoveHistory(moveHistory);
        state.ui.showPromotionModal(movingPiece[0]);
        state.ui.renderBoard();
        return false;
    }

    if (capturedPiece) captured[capturedPiece[0]].push(capturedPiece);
    const notation = getMoveNotation(
        fromR, fromC, toR, toC, moveMeta, !!capturedPiece);

    position.setPieceAt(fromR, fromC, null);
    position.setPieceAt(toR, toC, movingPiece);

    if (movingPiece[1] === "K" && Math.abs(toC - fromC) === 2) {
        if (toC === 6) {
            position.setPieceAt(toR, 5, position.pieceAt(toR, 7));
            position.setPieceAt(toR, 7, null);
        } else if (toC === 2) {
            position.setPieceAt(toR, 3, position.pieceAt(toR, 0));
            position.setPieceAt(toR, 0, null);
        }
    }

    position.recordMove(movingPiece, fromR, fromC, toR, toC, capturedPiece);
    moveHistory.push(notation);
    state.ui.renderMoveHistory(moveHistory);
    state.ui.setOpeningName(state.findOpeningName(position.toFEN()));
    return true;
}

function completePromotion(type) {
    const pendingPromotion = state.getPendingPromotion();
    if (!pendingPromotion) return false;
    const position = getPosition();
    const moveHistory = state.getMoveHistory();
    const { r, c, color } = pendingPromotion;

    position.setPieceAt(r, c, color + type);
    moveHistory[moveHistory.length - 1] += "=" + type;
    state.ui.renderMoveHistory(moveHistory);
    state.ui.setOpeningName(state.findOpeningName(position.toFEN()));
    state.setPendingPromotion(null);
    state.ui.hidePromotionModal();
    position.activeColor = position.activeColor === "w" ? "b" : "w";
    return true;
}

export {
    configureMoveState,
    toAlgebraic,
    getMoves,
    getPawnMoves,
    getRookMoves,
    getKnightMoves,
    getBishopMoves,
    getQueenMoves,
    getKingMoves,
    findKing,
    isKingInCheck,
    moveLeavesKingInCheck,
    filterLegalMoves,
    playerHasLegalMoves,
    getMoveNotation,
    getAllLegalMoves,
    simulateMove,
    evaluateBoard,
    chooseBotMove,
    performMove,
    completePromotion
};
