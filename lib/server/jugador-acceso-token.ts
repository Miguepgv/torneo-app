import { randomBytes } from "crypto";

export function generateJugadorAccesoToken(): string {
  return randomBytes(24).toString("hex");
}
