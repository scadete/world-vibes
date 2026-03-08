const { pipeline } = require("@xenova/transformers");

let _pipe = null;

async function getEmbedder() {
  if (!_pipe) {
    console.log("[embeddings] Loading paraphrase-multilingual-MiniLM-L12-v2 (first run downloads ~430MB)…");
    _pipe = await pipeline("feature-extraction", "Xenova/paraphrase-multilingual-MiniLM-L12-v2");
  }
  return _pipe;
}

// Returns a Buffer (BLOB) of 384 × float32 = 1536 bytes
async function embed(text) {
  const pipe = await getEmbedder();
  const out  = await pipe(text, { pooling: "mean", normalize: true });
  return Buffer.from(out.data.buffer);
}

module.exports = { embed };
