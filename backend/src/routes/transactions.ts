import { Router } from "express";
import { isAddress, parseTransaction, recoverTransactionAddress, type Hex, type TransactionSerialized } from "viem";
import { getChainConfig, getPublicClient } from "../chains/config";

export const transactionRouter = Router();
const transactionHex = /^0x(?:[a-fA-F0-9]{2}){1,100000}$/;
const hashPattern = /^0x[a-fA-F0-9]{64}$/;

transactionRouter.post("/submit", async (request, response) => {
  const { chain, signedTransaction } = request.body ?? {};
  const config = typeof chain === "string" ? getChainConfig(chain) : undefined;
  if (!config || typeof signedTransaction !== "string" || !transactionHex.test(signedTransaction)) {
    response.status(400).json({ error: "Provide a supported chain and signed EVM transaction" });
    return;
  }

  try {
    const serialized = signedTransaction as TransactionSerialized;
    const transaction = parseTransaction(serialized);
    if (!transaction.chainId || transaction.chainId !== config.chainId) {
      response.status(400).json({ error: "Signed transaction chain ID does not match the selected chain" });
      return;
    }
    if (!transaction.r || !transaction.s || transaction.v === undefined) {
      response.status(400).json({ error: "Transaction must contain a valid signature" });
      return;
    }
    const sender = await recoverTransactionAddress({ serializedTransaction: serialized });
    if (!isAddress(sender)) {
      response.status(400).json({ error: "Signed transaction has an invalid sender" });
      return;
    }
    const client = getPublicClient(config);
    const hash = await client.sendRawTransaction({ serializedTransaction: serialized });
    const { db } = await import("../db/index");
    await db.query(
      `INSERT INTO transaction_submissions (chain, tx_hash, sender, status)
       VALUES ($1, $2, $3, 'submitted')
       ON CONFLICT (chain, tx_hash) DO UPDATE SET updated_at = now()`,
      [config.id, hash, sender.toLowerCase()]
    );
    response.status(202).json({ chain: config.id, chainId: config.chainId, hash, sender, status: "submitted" });
  } catch {
    response.status(503).json({ error: "Transaction could not be submitted" });
  }
});

transactionRouter.get("/:chain/:hash", async (request, response) => {
  const config = getChainConfig(request.params.chain);
  const hash = request.params.hash;
  if (!config || !hashPattern.test(hash)) {
    response.status(400).json({ error: "Provide a supported chain and valid transaction hash" });
    return;
  }
  try {
    const client = getPublicClient(config);
    const receipt = await client.getTransactionReceipt({ hash: hash as Hex }).catch(() => null);
    if (receipt) {
      const status = receipt.status === "success" ? "confirmed" : "reverted";
      const head = await client.getBlockNumber();
      const confirmations = head >= receipt.blockNumber ? Number(head - receipt.blockNumber + 1n) : 0;
      const result = {
        chain: config.id,
        chainId: config.chainId,
        hash: receipt.transactionHash,
        status,
        from: receipt.from,
        to: receipt.to,
        blockNumber: receipt.blockNumber.toString(),
        blockHash: receipt.blockHash,
        confirmations,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      };
      const { db } = await import("../db/index");
      await db.query(
        `UPDATE transaction_submissions SET status = $3, receipt = $4::jsonb, updated_at = now()
         WHERE chain = $1 AND tx_hash = $2`,
        [config.id, hash.toLowerCase(), status, JSON.stringify(result)]
      );
      response.setHeader("Cache-Control", "no-store").json(result);
      return;
    }

    const pending = await client.getTransaction({ hash: hash as Hex }).catch(() => null);
    const { db } = await import("../db/index");
    const stored = await db.query<{ submitted_at: Date }>(
      "SELECT submitted_at FROM transaction_submissions WHERE chain = $1 AND tx_hash = $2",
      [config.id, hash.toLowerCase()]
    );
    const ageMs = stored.rows[0] ? Date.now() - new Date(stored.rows[0].submitted_at).getTime() : Infinity;
    const status = pending || ageMs < 15 * 60_000 ? "pending" : "not_found";
    if (status === "pending") {
      await db.query("UPDATE transaction_submissions SET status = 'pending', updated_at = now() WHERE chain = $1 AND tx_hash = $2", [config.id, hash.toLowerCase()]);
    }
    response.setHeader("Cache-Control", "no-store").json({ chain: config.id, chainId: config.chainId, hash, status });
  } catch {
    response.status(503).json({ error: "Transaction status is temporarily unavailable" });
  }
});
