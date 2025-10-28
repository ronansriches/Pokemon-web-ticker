// quick health check: proves your deployment and routing are alive
export default function handler(req, res) {
  res.status(200).json({ ok: true, now: new Date().toISOString() });
}
