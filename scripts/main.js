import ChessPosition from "./position.js";
import {
    configureMoveState,
    getMoves,
    filterLegalMoves,
    isKingInCheck,
    playerHasLegalMoves,
    chooseBotMove,
    performMove,
    completePromotion as completeMovePromotion
} from "./moves.js";
import {
    findOpeningName,
    loadOpeningData,
    resetOpeningName
} from "./openings.js";
import { ui } from "./ui.js";

/* Game State */
let position = new ChessPosition();
window.chess = Object.freeze({
    getFEN: () => position.toFEN(),
    getBitboards: () => position.toBitboards(),
    playUciMove
});

let moveHistory = [];

let captured = {
    w: [],
    b: []
};

let twoplayermode = true;
let selected = null;
let legalMovesForSelection = [];

let pendingPromotion = null;
let gameOver = false;

configureMoveState({
    getPosition: () => position,
    getCaptured: () => captured,
    getMoveHistory: () => moveHistory,
    getPendingPromotion: () => pendingPromotion,
    setPendingPromotion: value => { pendingPromotion = value; },
    ui,
    findOpeningName
});

function clearSelectionOutline() {
    selected = null;
    legalMovesForSelection = [];
    ui.clearSelectionOutline();
}

/* Piece movement */
function completePromotion(type) {
    if (!completeMovePromotion(type)) return;
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

/* Bot logic */
function makeBotMove() {
    const color = position.activeColor;
    const bestMove = chooseBotMove(color);
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
    resetOpeningName();
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