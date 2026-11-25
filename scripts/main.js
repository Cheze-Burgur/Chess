import ChessPosition from "./position.js";
import {
    inBounds,
    isEmpty,
    isEnemy,
    isFriend,
    squareIsAttacked
} from "./utils.js";
import { findOpeningName, loadOpeningData } from "./openings.js";
import { ui } from "./ui.js";

/* Game State */
let position = new ChessPosition();
window.chess = Object.freeze({
    getFEN: () => position.toFEN(),
    getBitboards: () => position.toBitboards(),
    playUciMove
});

let moveHistory = [];

const pieceValue = {
    P: 1,
    N: 3,
    B: 3,
    R: 5,
    Q: 9,
    K: 100
};

let captured = {
    w: [],
    b: []
};

let twoplayermode = true;
let selected = null;
let legalMovesForSelection = [];

let pendingPromotion = null;
let gameOver = false;

function toAlgebraic(r, c) {
    const files = "abcdefgh";
    const file = files[c];
    const rank = 8 - r;
    return file + rank;
}

function clearSelectionOutline() {
    selected = null;
    legalMovesForSelection = [];
    ui.clearSelectionOutline();
}

/* Piece movement */
function performMove(fromR, fromC, toR, toC, moveMeta) {
    const movingPiece = position.pieceAt(fromR, fromC);
    const targetPiece = position.pieceAt(toR, toC);
    let capturedPiece = targetPiece;

    // en passant
    if (moveMeta?.enPassant) {
        const dir = movingPiece[0] === "w" ? 1 : -1;
        capturedPiece = position.pieceAt(toR + dir, toC);
        position.setPieceAt(toR + dir, toC, null);
    }

    // trigger promotion
    if (movingPiece[1] === "P" &&
        ((movingPiece[0] === "w" && toR === 0) ||
            (movingPiece[0] === "b" && toR === 7))) {

        if (capturedPiece) captured[capturedPiece[0]].push(capturedPiece);
        const notation = getMoveNotation(
            fromR, fromC, toR, toC, moveMeta, !!capturedPiece
        );
        position.setPieceAt(fromR, fromC, null);
        position.setPieceAt(toR, toC, movingPiece);
        position.recordMove(movingPiece, fromR, fromC, toR, toC, capturedPiece, false);
        moveHistory.push(notation);
        ui.renderMoveHistory(moveHistory);

        pendingPromotion = { r: toR, c: toC, color: movingPiece[0] };
        ui.showPromotionModal(movingPiece[0]);
        ui.renderBoard();
        return false;
    }

    if (capturedPiece) {
        captured[capturedPiece[0]].push(capturedPiece);
    }

    const wasCapture = !!capturedPiece;
    const notation = getMoveNotation(
        fromR,
        fromC,
        toR,
        toC,
        moveMeta,
        wasCapture
    );

    // move piece
    position.setPieceAt(fromR, fromC, null);
    position.setPieceAt(toR, toC, movingPiece);

    // castling rook movement
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
    ui.renderMoveHistory(moveHistory);
    ui.setOpeningName(findOpeningName(position.toFEN()));

    return true;
}

function completePromotion(type) {
    const { r, c, color } = pendingPromotion;
    position.setPieceAt(r, c, color + type);
    moveHistory[moveHistory.length - 1] += "=" + type;
    ui.renderMoveHistory(moveHistory);
    ui.setOpeningName(findOpeningName(position.toFEN()));

    pendingPromotion = null;
    ui.hidePromotionModal();
    position.activeColor = position.activeColor === "w" ? "b" : "w";
    clearSelectionOutline();
    completeTurn();

    if (!twoplayermode && position.activeColor === "b" && !gameOver) {
        setTimeout(makeBotMove, 1000);
    }
}

function completeTurn() {
    if (isKingInCheck(position.activeColor)) {
        const hasMoves = playerHasLegalMoves(position.activeColor);
        moveHistory[moveHistory.length - 1] += hasMoves ? "+" : "#";
        ui.renderMoveHistory(moveHistory);
    }

    ui.renderBoard();
    evaluateGameEnd();
}

function playUciMove(uciMove) {
    const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uciMove);
    if (!match) throw new TypeError("UCI move must look like e2e4 or a7a8q");
    if (gameOver || pendingPromotion) {
        throw new Error("Cannot play a move while the game is paused or over");
    }

    const [, from, to, promotion] = match;
    const fromC = from.charCodeAt(0) - 97;
    const fromR = 8 - Number(from[1]);
    const toC = to.charCodeAt(0) - 97;
    const toR = 8 - Number(to[1]);
    const piece = position.pieceAt(fromR, fromC);
    if (!piece || piece[0] !== position.activeColor) {
        throw new RangeError(`No ${position.activeColor} piece on ${from}`);
    }

    const promotionRequired = piece[1] === "P" && (toR === 0 || toR === 7);
    if (promotionRequired !== !!promotion) {
        throw new TypeError(promotionRequired
            ? "UCI promotion moves must specify q, r, b, or n"
            : "Only promotion moves may include a promotion piece");
    }

    const move = filterLegalMoves(fromR, fromC, getMoves(fromR, fromC))
        .find(candidate => candidate.r === toR && candidate.c === toC);
    if (!move) throw new RangeError(`Illegal move: ${uciMove}`);

    clearSelectionOutline();
    const completed = performMove(fromR, fromC, toR, toC, move);
    if (completed) {
        completeTurn();
    } else {
        completePromotion(promotion.toUpperCase());
    }
}

function handleMoveAttempt(r, c) {
    if (!selected) return;
    const legal = filterLegalMoves(
        selected.r,
        selected.c,
        getMoves(selected.r, selected.c));

    const moveMeta = legal.find(m => m.r === r && m.c === c);
    if (!moveMeta) {
        clearSelectionOutline();
        return;
    }

    const completed = performMove(
        selected.r,
        selected.c,
        r,
        c,
        moveMeta
    );

    setTimeout(() => {
        if (!twoplayermode && position.activeColor === "b" && !gameOver && !pendingPromotion) {
            makeBotMove();
        }
    }, 1000);

    clearSelectionOutline();

    if (!completed) return; // if promoting, pause

    completeTurn();
}

/* Input Handling */
function handleBoardClick(r, c) {
    if (gameOver || pendingPromotion) return;
    const piece = position.pieceAt(r, c);

    if (!selected) {
        if (!twoplayermode && position.activeColor === "b") return;
        handleSelectSquare(r, c, piece);
    } else if (selected.r === r && selected.c === c) {
        clearSelectionOutline();
        ui.renderBoard();
    } else if (piece && piece[0] === position.activeColor) {
        clearSelectionOutline();
        handleSelectSquare(r, c, piece);
    } else {
        handleMoveAttempt(r, c);
    }
}

function handleDragStart(r, c, piece) {
    if (gameOver || pendingPromotion ||
        piece[0] !== position.activeColor ||
        (!twoplayermode && position.activeColor === "b")) {
        return false;
    }

    selected = { r, c };
    legalMovesForSelection = filterLegalMoves(r, c, getMoves(r, c));
    return true;
}

function handleDrop(r, c) {
    handleMoveAttempt(r, c);
    clearSelectionOutline();
}

function handleOutsideClick() {
    clearSelectionOutline();
}

function handleModeChange(twoPlayerMode) {
    twoplayermode = twoPlayerMode;
    if (!twoplayermode && position.activeColor === "b") {
        setTimeout(makeBotMove, 1000);
    }
}

function handleSelectSquare(r, c, piece) {
    if (piece && piece[0] === position.activeColor) {
        selected = { r, c };
        legalMovesForSelection = filterLegalMoves(r, c, getMoves(r, c));
        ui.renderBoard();
        return true;
    }
    return false;
}

/* Move Generation */
function getMoves(r, c, forAttack = false) {
    const piece = position.pieceAt(r, c);
    if (!piece) return [];

    const type = piece[1];

    switch (type) {
        case "P": return getPawnMoves(r, c);
        case "R": return getRookMoves(r, c);
        case "N": return getKnightMoves(r, c);
        case "B": return getBishopMoves(r, c);
        case "Q": return getQueenMoves(r, c);
        case "K": return getKingMoves(r, c, forAttack);
    }
}

function getPawnMoves(r, c) {
    const piece = position.pieceAt(r, c);
    const color = piece[0];
    const dir = color === "w" ? -1 : 1;
    const startRow = color === "w" ? 6 : 1;

    const moves = [];

    // forward
    if (isEmpty(position, r + dir, c))
        moves.push({ r: r + dir, c });

    // double
    if (r === startRow &&
        isEmpty(position, r + dir, c) &&
        isEmpty(position, r + 2 * dir, c))
        moves.push({ r: r + 2 * dir, c });

    // captures + en passant
    for (const dc of [-1, 1]) {
        if (isEnemy(position, r + dir, c + dc, color)) {
            moves.push({ r: r + dir, c: c + dc });
        } else if (position.enPassantSquare ===
            ChessPosition.squareIndex(r + dir, c + dc)) {
            moves.push({
                r: r + dir,
                c: c + dc,
                enPassant: true
            });
        }
    }

    return moves;
}

function getBishopMoves(r, c) {
    const color = position.pieceAt(r, c)[0];
    return rayMoves(r, c,
        [[1, 1], [1, -1], [-1, 1], [-1, -1]],
        color
    );
}


function getKnightMoves(r, c) {
    const color = position.pieceAt(r, c)[0];
    const moves = [];

    const jumps = [
        [2, 1], [2, -1], [-2, 1], [-2, -1],
        [1, 2], [1, -2], [-1, 2], [-1, -2]
    ];

    for (const [dr, dc] of jumps) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        if (!isFriend(position, nr, nc, color))
            moves.push({ r: nr, c: nc });
    }

    return moves;
}

function getRookMoves(r, c) {
    const color = position.pieceAt(r, c)[0];
    return rayMoves(r, c,
        [[1, 0], [-1, 0], [0, 1], [0, -1]],
        color
    );
}

function getQueenMoves(r, c) {
    return [
        ...getRookMoves(r, c),
        ...getBishopMoves(r, c)
    ];
}

// King moves
function getKingMoves(r, c, forAttack = false) {
    const color = position.pieceAt(r, c)[0];
    const moves = [];

    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;

            const nr = r + dr, nc = c + dc;
            if (!inBounds(nr, nc)) continue;
            if (!isFriend(position, nr, nc, color))
                moves.push({ r: nr, c: nc });
        }
    }

    // castling
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
    const moves = [];

    for (const [dr, dc] of dirs) {
        let nr = r + dr;
        let nc = c + dc;

        while (inBounds(nr, nc)) {
            if (isEmpty(position, nr, nc)) {
                moves.push({ r: nr, c: nc });
            } else {
                if (isEnemy(position, nr, nc, color))
                    moves.push({ r: nr, c: nc });
                break;
            }

            nr += dr;
            nc += dc;
        }
    }

    return moves;
}

// Legality, check, & checkmate
function findKing(color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (position.pieceAt(r, c) === color + "K") {
                return { r, c };
            }
        }
    }
    return null;
}

function isKingInCheck(color) {
    const king = findKing(color);
    if (!king) return false;

    const enemy = color === "w" ? "b" : "w";
    return squareIsAttacked(position, king.r, king.c, enemy, getMoves);
}

function moveLeavesKingInCheck(fromR, fromC, move) {
    const snapshot = position.clone();
    const piece = snapshot.pieceAt(fromR, fromC);
    snapshot.setPieceAt(fromR, fromC, null);
    snapshot.setPieceAt(move.r, move.c, piece);

    // handle en passant simulation
    if (move.enPassant) {
        const dir = piece[0] === "w" ? 1 : -1;
        snapshot.setPieceAt(move.r + dir, move.c, null);
    }

    // handle castling simulation
    if (move.castle && piece[1] === "K") {
        if (move.c === 6) {
            snapshot.setPieceAt(move.r, 5, snapshot.pieceAt(move.r, 7));
            snapshot.setPieceAt(move.r, 7, null);
        } else if (move.c === 2) {
            snapshot.setPieceAt(move.r, 3, snapshot.pieceAt(move.r, 0));
            snapshot.setPieceAt(move.r, 0, null);
        }
    }

    const oldPosition = position;
    position = snapshot;

    const inCheck = isKingInCheck(piece[0]);

    position = oldPosition;

    return inCheck;
}

function filterLegalMoves(r, c, moves) {
    const piece = position.pieceAt(r, c);
    const enemyKing = (piece[0] === "w" ? "b" : "w") + "K";
    return moves.filter(m =>
        position.pieceAt(m.r, m.c) !== enemyKing &&
        !moveLeavesKingInCheck(r, c, m)
    );
}

function playerHasLegalMoves(color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = position.pieceAt(r, c);
            if (!p || p[0] !== color) continue;

            const moves = filterLegalMoves(r, c, getMoves(r, c));
            if (moves.length > 0) return true;
        }
    }
    return false;
}

/* Notation */
function getMoveNotation(fromR, fromC, toR, toC, moveMeta, wasCapture) {
    const piece = position.pieceAt(fromR, fromC);
    const pieceType = piece[1];
    const targetSquare = toAlgebraic(toR, toC);

    // Castling
    if (moveMeta?.castle === "ks") return "O-O";
    if (moveMeta?.castle === "qs") return "O-O-O";

    let notation = "";

    // Piece letter (pawns have no letter)
    if (pieceType !== "P") {
        notation += pieceType.toUpperCase();
    }

    // Pawn capture needs file letter
    if (pieceType === "P" && wasCapture) {
        notation += toAlgebraic(fromR, fromC)[0];
    }

    if (wasCapture) {
        notation += "x";
    }

    notation += targetSquare;

    // Promotion
    if (moveMeta?.promotion) {
        notation += "=" + moveMeta.promotion.toUpperCase();
    }

    return notation;
}

/* Bot logic */
function makeBotMove() {
    const color = position.activeColor;

    const allMoves = getAllLegalMoves(color);

    let bestMove = null;
    let bestScore = -Infinity;

    for (const move of allMoves) {

        const newBoard = simulateMove(position, move);

        const score = evaluateBoard(newBoard);

        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }

    if (!bestMove) return;

    const completed = performMove(
        bestMove.fromR,
        bestMove.fromC,
        bestMove.toR,
        bestMove.toC,
        bestMove.meta
    );
    if (completed) {
        completeTurn();
    } else {
        completePromotion("Q");
    }
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

function getAllLegalMoves(color) {
    const moves = [];

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = position.pieceAt(r, c);
            if (!piece || piece[0] !== color) continue;

            const legal = filterLegalMoves(r, c, getMoves(r, c));

            for (const m of legal) {
                moves.push({
                    fromR: r,
                    fromC: c,
                    toR: m.r,
                    toC: m.c,
                    meta: m
                });
            }
        }
    }

    return moves;
}

/* Game over logic */
function evaluateGameEnd() {
    const inCheck = isKingInCheck(position.activeColor);
    const hasMoves = playerHasLegalMoves(position.activeColor);

    if (!hasMoves && inCheck) {
        gameOver = true;
        ui.showGameOver(
            (position.activeColor === "w" ? "White" : "Black") +
            " is checkmated!"
        );
    }
    else if (!hasMoves && !inCheck) {
        gameOver = true;
        ui.showGameOver("Stalemate!");
    }
}

/* Reset & Initialize */
function resetGame() {
    position = new ChessPosition();
    captured = {
        w: [],
        b: []
    };
    selected = null;
    legalMovesForSelection = [];
    moveHistory = [];
    pendingPromotion = null;
    gameOver = false;

    ui.clearAnnotations();
    ui.renderMoveHistory(moveHistory);
    ui.setOpeningName("—");
    clearSelectionOutline();
    ui.renderBoard();
}

async function init() {
    await loadOpeningData();
    ui.setup({
        getPosition: () => position,
        getViewState: () => ({
            position,
            selected,
            legalMovesForSelection,
            captured,
            isKingInCheck
        }),
        isPaused: () => gameOver || pendingPromotion,
        onSquareClick: handleBoardClick,
        onDragStart: handleDragStart,
        onDrop: handleDrop,
        onOutsideClick: handleOutsideClick,
        onModeChange: handleModeChange,
        onReset: resetGame,
        onPromotion: completePromotion
    });
    ui.renderBoard();
}

init();