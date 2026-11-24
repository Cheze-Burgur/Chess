const PIECE_TYPES = ["P", "N", "B", "R", "Q", "K"];
const COLORS = ["w", "b"];
const STARTING_BOARD = [
    ["bR", "bN", "bB", "bQ", "bK", "bB", "bN", "bR"],
    ["bP", "bP", "bP", "bP", "bP", "bP", "bP", "bP"],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ["wP", "wP", "wP", "wP", "wP", "wP", "wP", "wP"],
    ["wR", "wN", "wB", "wQ", "wK", "wB", "wN", "wR"]
];

const CASTLING_RIGHTS = {
    w: { kingSide: 1, queenSide: 2 },
    b: { kingSide: 4, queenSide: 8 }
};

export default class ChessPosition {
    constructor(board = STARTING_BOARD) {
        this.bitboards = Object.fromEntries(
            COLORS.flatMap(color => PIECE_TYPES.map(type => [color + type, 0n]))
        );
        this.activeColor = "w";
        this.castlingRights = 15;
        this.enPassantSquare = null;
        this.halfmoveClock = 0;
        this.fullmoveNumber = 1;

        if (board) {
            for (let row = 0; row < 8; row++) {
                for (let col = 0; col < 8; col++) {
                    if (board[row][col]) this.setPieceAt(row, col, board[row][col]);
                }
            }
        }
    }

    static squareIndex(row, col) {
        return (7 - row) * 8 + col;
    }

    pieceAt(row, col) {
        if (row < 0 || row >= 8 || col < 0 || col >= 8) return null;
        const mask = 1n << BigInt(ChessPosition.squareIndex(row, col));
        for (const piece in this.bitboards) {
            if ((this.bitboards[piece] & mask) !== 0n) return piece;
        }
        return null;
    }

    setPieceAt(row, col, piece) {
        if (row < 0 || row >= 8 || col < 0 || col >= 8) {
            throw new RangeError("Square is outside the chessboard");
        }
        if (piece !== null && !Object.prototype.hasOwnProperty.call(this.bitboards, piece)) {
            throw new TypeError(`Invalid piece: ${piece}`);
        }

        const mask = 1n << BigInt(ChessPosition.squareIndex(row, col));
        for (const key in this.bitboards) {
            this.bitboards[key] &= ~mask;
        }
        if (piece) this.bitboards[piece] |= mask;
    }

    clone() {
        const copy = new ChessPosition(null);
        copy.bitboards = { ...this.bitboards };
        copy.activeColor = this.activeColor;
        copy.castlingRights = this.castlingRights;
        copy.enPassantSquare = this.enPassantSquare;
        copy.halfmoveClock = this.halfmoveClock;
        copy.fullmoveNumber = this.fullmoveNumber;
        return copy;
    }

    canCastle(color, side) {
        return (this.castlingRights & CASTLING_RIGHTS[color][side]) !== 0;
    }

    clearCastlingRight(color, side) {
        this.castlingRights &= ~CASTLING_RIGHTS[color][side];
    }

    recordMove(piece, fromR, fromC, toR, toC, capturedPiece, toggleTurn = true) {
        const fromIndex = ChessPosition.squareIndex(fromR, fromC);
        const toIndex = ChessPosition.squareIndex(toR, toC);
        const color = piece[0];
        const opponent = color === "w" ? "b" : "w";

        this.enPassantSquare = null;
        if (piece[1] === "P" && Math.abs(toR - fromR) === 2) {
            this.enPassantSquare = ChessPosition.squareIndex((toR + fromR) / 2, toC);
        }

        if (piece[1] === "K") {
            this.clearCastlingRight(color, "kingSide");
            this.clearCastlingRight(color, "queenSide");
        } else if (piece[1] === "R") {
            this.clearRookRight(color, fromIndex);
        }
        if (capturedPiece && capturedPiece[1] === "R") {
            this.clearRookRight(opponent, toIndex);
        }

        this.halfmoveClock = piece[1] === "P" || capturedPiece
            ? 0
            : this.halfmoveClock + 1;
        if (color === "b") this.fullmoveNumber++;
        if (toggleTurn) this.activeColor = opponent;
    }

    clearRookRight(color, squareIndex) {
        if (color === "w" && squareIndex === 0) this.clearCastlingRight("w", "queenSide");
        if (color === "w" && squareIndex === 7) this.clearCastlingRight("w", "kingSide");
        if (color === "b" && squareIndex === 56) this.clearCastlingRight("b", "queenSide");
        if (color === "b" && squareIndex === 63) this.clearCastlingRight("b", "kingSide");
    }

    toBitboards() {
        return { ...this.bitboards };
    }

    toFEN() {
        const ranks = [];
        for (let row = 0; row < 8; row++) {
            let rank = "";
            let emptyCount = 0;
            for (let col = 0; col < 8; col++) {
                const piece = this.pieceAt(row, col);
                if (!piece) {
                    emptyCount++;
                    continue;
                }
                if (emptyCount) rank += emptyCount;
                emptyCount = 0;
                rank += piece[0] === "w" ? piece[1] : piece[1].toLowerCase();
            }
            if (emptyCount) rank += emptyCount;
            ranks.push(rank);
        }

        const castling = [
            this.canCastle("w", "kingSide") ? "K" : "",
            this.canCastle("w", "queenSide") ? "Q" : "",
            this.canCastle("b", "kingSide") ? "k" : "",
            this.canCastle("b", "queenSide") ? "q" : ""
        ].join("") || "-";
        const enPassant = this.enPassantSquare === null
            ? "-"
            : String.fromCharCode(97 + (this.enPassantSquare % 8)) +
            (Math.floor(this.enPassantSquare / 8) + 1);

        return `${ranks.join("/")} ${this.activeColor} ${castling} ${enPassant} ${this.halfmoveClock} ${this.fullmoveNumber}`;
    }
}
