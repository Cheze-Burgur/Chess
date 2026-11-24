let openingsByFen;

async function loadOpeningData() {
    const response = await fetch(new URL("../data/codes.json", import.meta.url));
    if (!response.ok) {
        throw new Error(`Failed to load opening data: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new TypeError("Opening data must be an object keyed by FEN");
    }
    openingsByFen = data;
}

function findOpeningName(fen) {
    if (!openingsByFen) {
        throw new Error("Opening data has not been loaded");
    }

    const positionFen = fen.split(" ").slice(0, 4).join(" ");
    return openingsByFen[positionFen]?.name || "—";
}

export { loadOpeningData, findOpeningName };
