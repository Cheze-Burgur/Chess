const BOARD_SIZE = 8;
const TILE_SIZE = 80;

class ChessUI {
    constructor() {
        this.board = document.getElementById("board");
        this.ghost = document.getElementById("ghost");
        this.ghostContext = this.ghost.getContext("2d");
        this.ghost.width = TILE_SIZE;
        this.ghost.height = TILE_SIZE;
        this.promotionModal = document.getElementById("promotionModal");
        this.gameOverModal = document.getElementById("gameOverModal");
        this.gameOverText = document.getElementById("gameOverText");
        this.turnIndicator = document.getElementById("turnIndicator");
        this.twoPlayerBtn = document.getElementById("twoPlayerBtn");
        this.vsBotBtn = document.getElementById("vsBotBtn");
        this.handlers = null;
        this.dragging = false;
        this.highlights = new Set();
        this.arrows = [];
        this.annotationStart = null;
        this.annotationTarget = null;
    }

    setup(callbacks) {
        this.handlers = callbacks;
        this.buildBoard();
        this.setupPromotions();
        this.setupEventListeners();
        this.twoPlayerBtn.classList.add("mode-active");
        document.getElementById("modeLabel").textContent = "Playing against player";
    }

    setupEventListeners() {
        this.board.addEventListener("click", event => {
            if (event.button !== 0 || this.dragging || this.handlers.isPaused()) return;

            const square = event.target.closest(".square");
            if (square) this.handlers.onSquareClick(+square.dataset.row, +square.dataset.col);
        });

        this.board.addEventListener("mousedown", event => {
            if (event.button === 2) {
                event.preventDefault();
                if (this.handlers.isPaused()) return;

                const square = event.target.closest(".square");
                if (square) {
                    this.annotationStart = this.squareCoordinates(square);
                    this.annotationTarget = this.annotationStart;
                }
                return;
            }
            if (event.button !== 0) return;
            if (this.handlers.isPaused()) return;

            const square = event.target.closest(".square");
            if (!square) return;

            const row = +square.dataset.row;
            const col = +square.dataset.col;
            const piece = this.handlers.getPosition().pieceAt(row, col);
            if (!piece || !this.handlers.onDragStart(row, col, piece)) return;

            this.dragging = true;
            this.ghost.style.display = "block";
            this.ghostContext.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
            drawPiece(this.ghostContext, piece);
            this.ghost.style.left = event.clientX + "px";
            this.ghost.style.top = event.clientY + "px";
            this.renderBoard();
        });

        document.addEventListener("mousemove", event => {
            if (this.annotationStart) {
                const square = this.squareAtPoint(event.clientX, event.clientY);
                const target = square ? this.squareCoordinates(square) : null;
                if (!this.sameSquare(this.annotationTarget, target)) {
                    this.annotationTarget = target;
                    this.renderAnnotations();
                }
                return;
            }
            if (!this.dragging) return;
            this.ghost.style.left = event.clientX + "px";
            this.ghost.style.top = event.clientY + "px";
        });

        document.addEventListener("mouseup", event => {
            if (event.button === 2 && this.annotationStart) {
                const end = this.squareAtPoint(event.clientX, event.clientY);
                if (end) {
                    const target = this.squareCoordinates(end);
                    if (this.sameSquare(this.annotationStart, target)) {
                        this.toggleHighlight(target);
                    } else {
                        this.toggleArrow(this.annotationStart, target);
                    }
                }
                this.annotationStart = null;
                this.annotationTarget = null;
                this.renderAnnotations();
                return;
            }
            if (!this.dragging) return;

            const square = this.squareAtPoint(event.clientX, event.clientY);
            this.dragging = false;
            this.ghost.style.display = "none";

            if (square) {
                const { row, col } = this.squareCoordinates(square);
                this.handlers.onDrop(row, col);
            } else {
                this.handlers.onOutsideClick();
            }
            this.renderBoard();
        });

        this.board.addEventListener("contextmenu", event => event.preventDefault());

        document.addEventListener("click", event => {
            if (!event.target.closest("#board")) {
                this.handlers.onOutsideClick();
                this.renderBoard();
            }
        });

        this.twoPlayerBtn.onclick = () => {
            this.twoPlayerBtn.classList.add("mode-active");
            this.vsBotBtn.classList.remove("mode-active");
            document.getElementById("modeLabel").textContent = "Playing against player";
            this.handlers.onModeChange(true);
        };

        this.vsBotBtn.onclick = () => {
            this.vsBotBtn.classList.add("mode-active");
            this.twoPlayerBtn.classList.remove("mode-active");
            document.getElementById("modeLabel").textContent = "Playing against bot";
            this.handlers.onModeChange(false);
        };

        document.getElementById("viewBoardBtn").onclick = () =>
            this.hideModal(this.gameOverModal);
        document.getElementById("newGameBtn").onclick = () => {
            this.handlers.onReset();
            this.hideModal(this.gameOverModal);
        };
        document.getElementById("resetBtn").onclick = this.handlers.onReset;

        document.querySelectorAll("#promotionMenu canvas").forEach(canvas => {
            canvas.addEventListener("click", () =>
                this.handlers.onPromotion(canvas.dataset.piece));
        });
    }

    buildBoard() {
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const square = document.createElement("div");
                square.className = "square";
                square.dataset.row = row;
                square.dataset.col = col;
                square.classList.add((row + col) % 2 === 0 ? "light" : "dark");

                const canvas = document.createElement("canvas");
                canvas.width = TILE_SIZE;
                canvas.height = TILE_SIZE;
                canvas.className = "piece-canvas";
                square.appendChild(canvas);
                this.board.appendChild(square);
            }
        }

        const svgNamespace = "http://www.w3.org/2000/svg";
        this.annotationLayer = document.createElementNS(svgNamespace, "svg");
        this.annotationLayer.classList.add("board-annotations");
        this.annotationLayer.setAttribute("viewBox", "0 0 8 8");
        this.annotationLayer.setAttribute("aria-hidden", "true");

        const marker = document.createElementNS(svgNamespace, "marker");
        marker.id = "annotation-arrowhead";
        marker.setAttribute("markerWidth", "0.3");
        marker.setAttribute("markerHeight", "0.3");
        marker.setAttribute("refX", "0.25");
        marker.setAttribute("refY", "0.15");
        marker.setAttribute("orient", "auto");
        marker.setAttribute("markerUnits", "userSpaceOnUse");

        const arrowhead = document.createElementNS(svgNamespace, "path");
        arrowhead.setAttribute("d", "M0 0 L0.3 0.15 L0 0.3 Z");
        arrowhead.classList.add("annotation-arrowhead");
        marker.appendChild(arrowhead);

        const definitions = document.createElementNS(svgNamespace, "defs");
        definitions.appendChild(marker);
        this.annotationLayer.appendChild(definitions);
        this.board.appendChild(this.annotationLayer);
    }

    renderBoard() {
        const state = this.handlers.getViewState();

        document.querySelectorAll(".square").forEach(square => {
            const row = +square.dataset.row;
            const col = +square.dataset.col;
            square.classList.toggle(
                "selected",
                !!state.selected && state.selected.r === row && state.selected.c === col
            );
            const canvas = square.querySelector("canvas");
            const context = canvas.getContext("2d");
            context.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
            this.drawHighlights(context, row, col, state);

            let piece = state.position.pieceAt(row, col);
            if (this.dragging && state.selected &&
                state.selected.r === row && state.selected.c === col) {
                piece = null;
            }

            if (piece && piece[1] === "K" && state.isKingInCheck(piece[0])) {
                context.save();
                context.strokeStyle = "red";
                context.lineWidth = 5;
                context.strokeRect(6, 6, TILE_SIZE - 12, TILE_SIZE - 12);
                context.restore();
            }
            if (piece) drawPiece(context, piece);
        });

        this.renderAnnotations();
        this.turnIndicator.textContent =
            state.position.activeColor === "w" ? "White to move" : "Black to move";
        this.renderCaptured(state.captured);
    }

    renderAnnotations() {
        if (!this.annotationLayer) return;

        this.board.querySelectorAll(".square").forEach(square => {
            square.classList.toggle(
                "annotation-highlight",
                this.highlights.has(this.squareKey(+square.dataset.row, +square.dataset.col))
            );
        });
        this.annotationLayer.querySelectorAll(".annotation-arrow")
            .forEach(arrow => arrow.remove());

        const arrows = [...this.arrows];
        if (this.annotationStart && this.annotationTarget &&
            !this.sameSquare(this.annotationStart, this.annotationTarget)) {
            arrows.push({ from: this.annotationStart, to: this.annotationTarget });
        }

        arrows.forEach(({ from, to }) => {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.classList.add("annotation-arrow");
            line.setAttribute("x1", from.col + 0.5);
            line.setAttribute("y1", from.row + 0.5);
            line.setAttribute("x2", to.col + 0.5);
            line.setAttribute("y2", to.row + 0.5);
            line.setAttribute("marker-end", "url(#annotation-arrowhead)");
            this.annotationLayer.appendChild(line);
        });
    }

    squareAtPoint(x, y) {
        return document.elementFromPoint(x, y)?.closest(".square") || null;
    }

    squareCoordinates(square) {
        return { row: +square.dataset.row, col: +square.dataset.col };
    }

    squareKey(row, col) {
        return `${row},${col}`;
    }

    sameSquare(first, second) {
        return !!first && !!second && first.row === second.row && first.col === second.col;
    }

    toggleHighlight({ row, col }) {
        const key = this.squareKey(row, col);
        if (this.highlights.has(key)) {
            this.highlights.delete(key);
        } else {
            this.highlights.add(key);
        }
    }

    toggleArrow(from, to) {
        const index = this.arrows.findIndex(arrow =>
            this.sameSquare(arrow.from, from) && this.sameSquare(arrow.to, to)
        );
        if (index >= 0) {
            this.arrows.splice(index, 1);
        } else {
            this.arrows.push({ from, to });
        }
    }

    clearAnnotations() {
        this.highlights.clear();
        this.arrows = [];
        this.annotationStart = null;
        this.annotationTarget = null;
        this.renderAnnotations();
    }

    drawHighlights(context, row, col, state) {
        if (!state.selected ||
            !state.legalMovesForSelection.some(move => move.r === row && move.c === col)) {
            return;
        }

        const size = context.canvas.width;
        const targetPiece = state.position.pieceAt(row, col);
        context.save();
        if (targetPiece) {
            context.strokeStyle = "rgba(180,0,0,0.9)";
            context.lineWidth = 5;
            context.beginPath();
            context.arc(size / 2, size / 2, size * 0.35, 0, Math.PI * 2);
            context.stroke();
        } else {
            context.fillStyle = "rgba(160,160,160,0.6)";
            context.beginPath();
            context.arc(size / 2, size / 2, size * 0.12, 0, Math.PI * 2);
            context.fill();
        }
        context.restore();
    }

    renderCaptured(captured) {
        const white = document.getElementById("capturedWhite");
        const black = document.getElementById("capturedBlack");
        white.innerHTML = "";
        black.innerHTML = "";

        const drawCaptured = piece => {
            const canvas = document.createElement("canvas");
            canvas.width = 28;
            canvas.height = 28;
            canvas.className = "captured-piece";
            const context = canvas.getContext("2d");
            const template = document.createElement("canvas");
            template.width = TILE_SIZE;
            template.height = TILE_SIZE;
            drawPiece(template.getContext("2d"), piece);
            context.drawImage(template, 0, 0, canvas.width, canvas.height);
            return canvas;
        };

        captured.w.forEach(piece => white.appendChild(drawCaptured(piece)));
        captured.b.forEach(piece => black.appendChild(drawCaptured(piece)));
        if (!captured.w.length) white.textContent = "—";
        if (!captured.b.length) black.textContent = "—";
    }

    renderMoveHistory(moveHistory) {
        const container = document.getElementById("moveHistory");
        container.innerHTML = "";
        if (!moveHistory.length) {
            container.textContent = "—";
            return;
        }

        for (let i = 0; i < moveHistory.length; i += 2) {
            const row = document.createElement("div");
            row.textContent = `${Math.floor(i / 2) + 1}. ${moveHistory[i] || ""} ${moveHistory[i + 1] || ""}`;
            container.appendChild(row);
        }
        container.scrollTop = container.scrollHeight;
    }

    setOpeningName(name) {
        document.getElementById("openingName").textContent = name;
    }

    clearSelectionOutline() {
        document.querySelectorAll(".square.selected")
            .forEach(square => square.classList.remove("selected"));
    }

    setupPromotions() {
        document.querySelectorAll("#promotionMenu canvas").forEach(canvas => {
            canvas.width = 70;
            canvas.height = 70;
            drawPiece(canvas.getContext("2d"), "w" + canvas.dataset.piece);
        });
    }

    showPromotionModal(color) {
        this.promotionModal.classList.remove("hidden");
        document.querySelectorAll("#promotionMenu canvas").forEach(canvas => {
            const context = canvas.getContext("2d");
            context.clearRect(0, 0, 70, 70);
            drawPiece(context, color + canvas.dataset.piece);
        });
    }

    hidePromotionModal() {
        this.promotionModal.classList.add("hidden");
    }

    showGameOver(text) {
        this.gameOverText.textContent = text;
        this.gameOverModal.classList.remove("hidden");
    }

    hideModal(modal) {
        modal.classList.add("hidden");
    }
}

function drawPiece(context, piece) {
    const size = context.canvas.width;
    const colors = piece[0] === "w"
        ? { fill: "#ffffff", stroke: "#000000" }
        : { fill: "#111111", stroke: "#eeeeee" };

    switch (piece[1]) {
        case "P": drawPawn(context, size, colors); break;
        case "R": drawRook(context, size, colors); break;
        case "N": drawKnight(context, size, colors); break;
        case "B": drawBishop(context, size, colors); break;
        case "Q": drawQueen(context, size, colors); break;
        case "K": drawKing(context, size, colors); break;
    }
}

function drawPawn(context, size, colors) {
    context.fillStyle = colors.fill;
    context.strokeStyle = colors.stroke;
    context.lineWidth = 2;
    context.beginPath();
    context.rect(size * 0.35, size * 0.45, size * 0.3, size * 0.25);
    context.fill();
    context.stroke();
    context.beginPath();
    context.arc(size / 2, size * 0.35, size * 0.12, 0, Math.PI * 2);
    context.fill();
    context.stroke();
}

function drawBishop(context, size, colors) {
    context.fillStyle = colors.fill;
    context.strokeStyle = colors.stroke;
    context.lineWidth = 2;
    context.beginPath();
    context.rect(size * 0.35, size * 0.45, size * 0.3, size * 0.25);
    context.fill();
    context.stroke();
    context.beginPath();
    context.arc(size / 2, size * 0.35, size * 0.12, Math.PI * 1.5, Math.PI * 1.25);
    context.lineTo(size / 2, size * 0.35);
    context.lineTo(size / 2, size * 0.23);
    context.fill();
    context.stroke();
}

function drawKnight(context, size, colors) {
    context.fillStyle = colors.fill;
    context.strokeStyle = colors.stroke;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(size * 0.35, size * 0.7);
    context.lineTo(size * 0.65, size * 0.7);
    context.lineTo(size * 0.6, size * 0.35);
    context.lineTo(size * 0.45, size * 0.3);
    context.lineTo(size * 0.4, size * 0.5);
    context.closePath();
    context.fill();
    context.stroke();
    context.beginPath();
    context.rect(size * 0.3, size / 2, size * 0.25, size * -0.3);
    context.fill();
    context.stroke();
}

function drawRook(context, size, colors, toothCount = 3) {
    context.fillStyle = colors.fill;
    context.strokeStyle = colors.stroke;
    context.lineWidth = 2;
    const top = size * 0.2;
    const toothDepth = size * 0.35;
    const bottom = size * 0.7;
    const left = size * 0.25;
    const right = size * 0.75;
    const toothWidth = (right - left) / toothCount;
    const cutWidth = toothWidth * 0.25;

    context.beginPath();
    context.moveTo(left, bottom);
    context.lineTo(left, top);
    for (let i = 0; i < toothCount; i++) {
        const start = left + i * toothWidth + (toothWidth - cutWidth) / 2;
        const end = start + cutWidth;
        context.lineTo(start, top);
        context.lineTo(start, toothDepth);
        context.lineTo(end, toothDepth);
        context.lineTo(end, top);
    }
    context.lineTo(right, top);
    context.lineTo(right, bottom);
    context.closePath();
    context.fill();
    context.stroke();
}

function drawQueen(context, size, colors, pointCount = 3.5) {
    context.fillStyle = colors.fill;
    context.strokeStyle = colors.stroke;
    context.lineWidth = 2;
    const bodyTop = size * 0.35;
    const bodyBottom = size * 0.7;
    const pointTop = size * 0.2;
    const bodyLeft = size * 0.25;
    const bodyRight = size * 0.75;
    const bodyWidth = bodyRight - bodyLeft;
    const pointWidth = bodyWidth / (pointCount * 2 + 1);

    context.beginPath();
    context.moveTo(bodyLeft, bodyBottom);
    context.lineTo(bodyLeft, bodyTop);
    let x = bodyLeft;
    for (let i = 0; i < pointCount * 2 + 1; i++) {
        x += pointWidth;
        context.lineTo(x, i % 2 === 0 ? pointTop : bodyTop);
    }
    context.lineTo(bodyRight, bodyBottom);
    context.closePath();
    context.fill();
    context.stroke();
}

function drawKing(context, size, colors) {
    context.fillStyle = colors.fill;
    context.strokeStyle = colors.stroke;
    context.beginPath();
    context.rect(size * 0.35, size * 0.45, size * 0.3, size * 0.25);
    context.fill();
    context.stroke();
    context.beginPath();
    context.rect(size * 0.43, size * 0.35, size * 0.15, size * 0.15);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(size * 0.51, size * 0.38);
    context.lineTo(size * 0.51, size * 0.46);
    context.moveTo(size * 0.46, size * 0.41);
    context.lineTo(size * 0.56, size * 0.41);
    context.stroke();
}

const ui = new ChessUI();

export { ui };