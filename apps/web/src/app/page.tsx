import { getAddress, isAddress } from "viem";
import { Landing } from "@/components/landing/landing";

// rendered per request so the token CA set on the VPS (ASTER_TOKEN_ADDRESS) shows without a rebuild
export const dynamic = "force-dynamic";

export default function Home() {
  const ca = process.env.ASTER_TOKEN_ADDRESS?.trim();
  return <Landing tokenAddress={ca && isAddress(ca) ? getAddress(ca) : null} />;
}
