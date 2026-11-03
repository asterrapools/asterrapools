#!/usr/bin/env bash
# Jalankan di: ROOT  ->  bash scripts/verify-contracts.sh <testnet|mainnet>
# Interactive explorer verification of every AsterraPools contract, built for screen recording. Four steps: check the
# chain and explorer, submit each contract's source code, read every contract back from the explorer as proof (contract
# name, full address and explorer link, grouped by module), then open any contract on the explorer.
# Sends no transaction, needs no keystore, and prints no wallet address or local path.
#
# Each contract is submitted with a source package prepared by scripts/verify-prepare.mjs, which already proved
# locally that the package compiles to the exact bytes deployed on-chain. Missing packages are prepared first.
# Results are also saved to docs/verification/<network>.md. Safe to re-run: verified contracts show as verified.
#
# Verifier: testnet submits to the Blockscout API directly. The mainnet Blockscout API sits behind a Cloudflare
# browser challenge that no command-line client passes (VPN included), so mainnet goes through Sourcify, which
# verifies the same package and forwards it to the explorer from its own servers. VERIFIER=blockscout|sourcify
# overrides the choice. PACE=0 removes the small reading delays between result cards.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NETWORK="${1:-}"

case "$NETWORK" in
  testnet) CHAIN=46630; NAME="Robinhood Chain Testnet"; EXPLORER="https://explorer.testnet.chain.robinhood.com"; RPC="https://rpc.testnet.chain.robinhood.com" ;;
  mainnet) CHAIN=4663; NAME="Robinhood Chain"; EXPLORER="https://robinhoodchain.blockscout.com"; RPC="https://rpc.mainnet.chain.robinhood.com" ;;
  *) echo "usage: bash scripts/verify-contracts.sh <testnet|mainnet>"; exit 1 ;;
esac
DEFAULT_VERIFIER=blockscout; [ "$NETWORK" = mainnet ] && DEFAULT_VERIFIER=sourcify
VERIFIER="${VERIFIER:-$DEFAULT_VERIFIER}"
SOURCIFY="https://sourcify.dev/server"

PKG="$ROOT/packages/contracts/verification/$NETWORK"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"; printf "\e[?25h"' EXIT
TTY=0; [ -t 0 ] && [ -t 1 ] && TTY=1

if [ "$TTY" = 1 ] && [ -z "${NO_COLOR:-}" ]; then
  B=$'\e[1m'; DIM=$'\e[2m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; C=$'\e[36m'; L=$'\e[38;5;118m'; N=$'\e[0m'
else
  B=""; DIM=""; G=""; Y=""; R=""; C=""; L=""; N=""
fi
OK="${G}✓${N}"; BAD="${R}✗${N}"

short() { echo "${1:0:6}…${1: -4}"; }
link() { echo "${EXPLORER}/address/$1?tab=contract"; }
# clickable in terminals that support OSC 8 hyperlinks; the URL text is shown either way
hyperlink() { if [ "$TTY" = 1 ]; then printf '\e]8;;%s\e\\%s\e]8;;\e\\' "$1" "$1"; else printf '%s' "$1"; fi; }
pause() { [ "$TTY" = 1 ] && { printf "  ${C}?${N} %s ${DIM}[Enter]${N} " "$1"; read -r _; }; }

# run "$@" in the background with a spinner and a status text; the command's output goes to $TMP/out
spin() {
  local text="$1"; shift
  "$@" >"$TMP/out" 2>&1 &
  local pid=$! frames='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏' k=0
  if [ "$TTY" = 1 ]; then
    printf "\e[?25l"
    while kill -0 "$pid" 2>/dev/null; do
      printf "\r  ${C}%s${N} %s" "${frames:k++%10:1}" "$text"; sleep 0.1
    done
    printf "\r\e[K\e[?25h"
  fi
  wait "$pid"
}

api() { curl -s --max-time 60 "$@"; }
json() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);console.log(eval(process.argv[1])??"")}catch{console.log("")}})' "$1"; }

sourcify_online() {
  api "${SOURCIFY}/chains" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).some(c=>c.chainId===+process.argv[1]&&c.supported)?"ok":"no")}catch{console.log("down")}})' "$CHAIN"
}

PACE="${PACE:-0.12}"
breathe() { [ "$TTY" = 1 ] && sleep "$PACE"; }
step() { echo; echo "  ${L}${B}Step $1/4${N}  ${B}$2${N}"; echo "  ${DIM}$3${N}"; echo; }

# Display rows from the manifest: real contract name, role and module. A proxy or beacon carries the name of the
# Asterra contract behind it; the manifest label tells which one ("DLMM factory (proxy)" -> AsterraDLMMFactory).
display_rows() {
  node -e '
    const m = require(process.argv[1]);
    const short = (s) => s.split(":").pop();
    const base = (l) => l.replace(/ \((proxy|implementation)\)$/, "").replace(/ beacon$/, "");
    const implOf = new Map();
    for (const x of m) if (!/^(ERC1967Proxy|UpgradeableBeacon)$/.test(short(x.contractName))) implOf.set(base(x.label), short(x.contractName));
    const MODULE = { AsterraHub: "Core", AsterraPositions: "Core", AsterraRouter: "Core", AsterraHook: "Core",
      AsterraDLMMFactory: "DLMM", AsterraDLMMLimitOrders: "DLMM", AsterraDLMMPool: "DLMM",
      AsterraDAMMFactory: "DAMM", AsterraDAMMPool: "DAMM", AsterraLaunchpad: "Launchpad", AsterraLaunchToken: "Launchpad",
      AsterraToken: "ASTER token & buyback", AsterraBuyback: "ASTER token & buyback",
      AsterraLendingVault: "Credit", AsterraCreditManager: "Credit", FaucetToken: "Test tokens" };
    for (const x of m) {
      const c = short(x.contractName);
      let name = c, role = "implementation";
      if (c === "ERC1967Proxy") { name = implOf.get(base(x.label)) ?? c; role = "proxy"; }
      else if (c === "UpgradeableBeacon") { name = implOf.get(base(x.label)) ?? c; role = "beacon"; }
      else if (c === "FaucetToken") { name = "FaucetToken " + x.label.split(" ")[0]; role = "test token"; }
      console.log([name, role, MODULE[name.split(" ")[0]] ?? "Other", x.address].join("\t"));
    }' "$PKG/manifest.json"
}

# ------------------------------------------------------------------ intro

clear 2>/dev/null || true
echo
echo "  ${L}${B}◆ ASTERRAPOOLS${N}  ${B}Smart contract verification${N}"
echo "  ${DIM}Built for the flow of every market.${N}"
echo "  ${DIM}────────────────────────────────────────────────────────────────${N}"
echo "  Network    ${B}${NAME}${N} ${DIM}· chain ${CHAIN}${N}"
echo "  Explorer   ${EXPLORER}"
if [ "$VERIFIER" = sourcify ]; then
  echo "  Method     source code verified by Sourcify against the bytecode"
  echo "             deployed on-chain, then published to the explorer"
else
  echo "  Method     the explorer compiles the published source code and"
  echo "             matches it against the bytecode deployed on-chain"
fi
echo
echo "  ${B}What happens${N}"
echo "  ${C}1${N}  Check that the chain and the explorer are online"
echo "  ${C}2${N}  Submit the source code of every contract to the explorer"
echo "  ${C}3${N}  Read every contract back from the explorer as proof"
echo "  ${C}4${N}  Open any contract on the explorer"
echo
pause "Press Enter to start"

# ------------------------------------------------------------------ 1 checks

step 1 "Checks" "Is the chain answering, and is the explorer ready to receive source code?"
spin "Connecting to ${NAME}" cast chain-id --rpc-url "$RPC"
if [ "$(tr -d '[:space:]' <"$TMP/out")" = "$CHAIN" ]; then echo "  ${OK} Chain online (${CHAIN})"; else echo "  ${BAD} Chain did not answer"; exit 1; fi

if [ "$VERIFIER" = sourcify ]; then
  spin "Connecting to Sourcify" sourcify_online
  if [ "$(cat "$TMP/out")" = ok ]; then
    echo "  ${OK} Sourcify online, chain ${CHAIN} supported"
  else
    echo "  ${BAD} Sourcify is not reachable or does not support chain ${CHAIN}"; exit 1
  fi
else
  spin "Connecting to the explorer" curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${EXPLORER}/api?module=block&action=eth_block_number"
  if [ "$(cat "$TMP/out")" = "200" ]; then
    echo "  ${OK} Explorer API online"
  else
    echo "  ${BAD} Explorer API refused the connection (HTTP $(cat "$TMP/out"))"
    echo "    ${DIM}Run with VERIFIER=sourcify to verify through Sourcify instead.${N}"
    exit 1
  fi
fi

if [ ! -f "$PKG/manifest.json" ]; then
  spin "Preparing source packages (compiling and matching bytecode)" bash -c "cd '$ROOT' && node scripts/verify-prepare.mjs '$NETWORK' --quiet"
  [ -f "$PKG/manifest.json" ] || { echo "  ${BAD} Could not prepare the source packages"; exit 1; }
fi
TOTAL="$(node -e "console.log(require('$PKG/manifest.json').length)")"
NAMES=(); ROLES=(); MODS=(); ADDRS=()
# addresses in their EIP-55 checksum form, the way the explorer shows them
while IFS=$'\t' read -r n r g a; do NAMES+=("$n"); ROLES+=("$r"); MODS+=("$g"); ADDRS+=("$(cast to-check-sum-address "$a" 2>/dev/null || echo "$a")"); done < <(display_rows)
echo "  ${OK} ${TOTAL} source packages ready, each proven to compile to its on-chain bytecode"
echo
pause "Press Enter to verify ${TOTAL} contracts"
# ------------------------------------------------------------------ submit

# Sourcify match for an address: exact_match | match | none
sourcify_match() {
  api "${SOURCIFY}/v2/contract/${CHAIN}/$1" | json 'j.match || "none"'
}

submit_sourcify() { # $1 manifest index
  local i="$1" address id res done_ tries
  address="$(node -e "console.log(require('$PKG/manifest.json')[$i].address)")"
  case "$(sourcify_match "$address")" in exact_match|match) echo already; return ;; esac
  node -e '
    const fs = require("fs");
    const [pkg, i, out] = process.argv.slice(1);
    const m = require(pkg + "/manifest.json")[+i];
    const body = { stdJsonInput: JSON.parse(fs.readFileSync(pkg + "/" + m.file, "utf8")), compilerVersion: m.compiler.replace(/^v/, ""), contractIdentifier: m.contractName };
    if (m.txHash) body.creationTransactionHash = m.txHash;
    fs.writeFileSync(out, JSON.stringify(body));' "$PKG" "$i" "$TMP/body.json"
  res="$(api -X POST "${SOURCIFY}/v2/verify/${CHAIN}/${address}" -H 'content-type: application/json' --data "@$TMP/body.json")"
  id="$(json 'j.verificationId' <<<"$res")"
  [ -n "$id" ] || { echo "failed:$(json 'j.message || j.customCode' <<<"$res" | cut -c1-80)"; return; }
  for tries in $(seq 1 60); do
    sleep 3
    res="$(api "${SOURCIFY}/v2/verify/${id}")"
    [ "$(json 'j.isJobCompleted' <<<"$res")" = true ] || continue
    case "$(json 'j.contract && j.contract.match' <<<"$res")" in
      exact_match|match) echo verified; return ;;
    esac
    echo "failed:$(json '(j.error && (j.error.message || j.error.customCode)) || "not verified"' <<<"$res" | cut -c1-80)"; return
  done
  echo "failed:timed out waiting for Sourcify"
}

submit() { # $1 manifest index -> prints: verified | already | failed:<reason>
  [ "$VERIFIER" = sourcify ] && { submit_sourcify "$1"; return; }
  local i="$1" address name args file guid res status tries
  read -r address name args file < <(node -e "const m=require('$PKG/manifest.json')[$i];console.log(m.address,m.contractName,m.args||'-',m.file)")
  [ "$args" = "-" ] && args=""
  # the explorer answers a second submission with a failure, so ask first
  if [ "$(api "${EXPLORER}/api/v2/addresses/${address}" | json 'j.is_verified ? "yes" : "no"')" = yes ]; then echo already; return; fi
  res="$(api -X POST "${EXPLORER}/api" \
    --data-urlencode "module=contract" --data-urlencode "action=verifysourcecode" \
    --data-urlencode "codeformat=solidity-standard-json-input" \
    --data-urlencode "contractaddress=${address}" --data-urlencode "contractname=${name}" \
    --data-urlencode "compilerversion=v0.8.26+commit.8a97fa7a" \
    --data-urlencode "constructorArguements=${args}" --data-urlencode "licenseType=3" \
    --data-urlencode "sourceCode@${PKG}/${file}")"
  if grep -qi "already verified" <<<"$res"; then echo already; return; fi
  status="$(json 'j.status' <<<"$res")"; guid="$(json 'j.result' <<<"$res")"
  [ "$status" = "1" ] || { echo "failed:$(json 'j.result||j.message' <<<"$res" | cut -c1-80)"; return; }
  # The status ticket is not reliable (the explorer sometimes forgets it: "Unknown UID"), so the contract page is the
  # source of truth: it counts as verified as soon as the explorer shows its source code.
  local last=""
  for tries in $(seq 1 60); do
    sleep 3
    res="$(api "${EXPLORER}/api?module=contract&action=checkverifystatus&guid=${guid}")"
    last="$(json 'j.result' <<<"$res")"
    case "$last" in
      *"Pass"*|*"pass"*) echo verified; return ;;
      *"lready"*) echo already; return ;;
    esac
    if [ "$(api "${EXPLORER}/api/v2/addresses/${address}" | json 'j.is_verified ? "yes" : "no"')" = yes ]; then echo verified; return; fi
    case "$last" in
      *"Fail"*|*"fail"*) break ;;
    esac
  done
  echo "failed:${last:-timed out waiting for the explorer}"
}


# ------------------------------------------------------------------ 2 verify

step 2 "Verify" "Each contract's source code goes to the explorer, which compiles it and compares it with the chain."
ok=0; failed=0
for ((i = 0; i < TOTAL; i++)); do
  head="$(printf "${DIM}%2d/%d${N}  %-30s ${DIM}%-15s %s${N}" "$((i + 1))" "$TOTAL" "${NAMES[$i]}" "${ROLES[$i]}" "$(short "${ADDRS[$i]}")")"
  spin "$(printf "%s  verifying…" "$head")" submit "$i"
  result="$(tail -1 "$TMP/out")"
  case "$result" in
    verified) printf "  ${OK} %s  ${G}verified${N}\n" "$head"; ok=$((ok + 1)) ;;
    already) printf "  ${OK} %s  ${G}verified${N}\n" "$head"; ok=$((ok + 1)) ;;
    *) printf "  ${BAD} %s  ${R}%s${N}\n" "$head" "${result#failed:}"; failed=$((failed + 1)) ;;
  esac
done
echo
pause "Press Enter to read every contract back from the explorer"

# ------------------------------------------------------------------ 3 proof

if [ "$VERIFIER" = sourcify ]; then
  step 3 "Proof" "Read back from sourcify.dev: contract name, full address and explorer link."
else
  step 3 "Proof" "Read back from ${EXPLORER#https://}: contract name, full address and explorer link."
fi
proven=0; MATCHES=(); last_mod=""
for idx in "${!ADDRS[@]}"; do
  a="${ADDRS[$idx]}"; v=""
  for t in 1 2 3 4 5; do
    if [ "$VERIFIER" = sourcify ]; then
      case "$(sourcify_match "$a")" in exact_match) v=full ;; match) v=partial ;; *) v=no ;; esac
    else
      v="$(api "${EXPLORER}/api/v2/smart-contracts/${a}" | json 'j.is_fully_verified ? "full" : j.is_partially_verified ? "partial" : j.is_verified ? "verified" : "no"')"
    fi
    [ "$v" = full ] && break; sleep 2
  done
  case "$v" in
    full) mark="$OK"; match="${G}exact match${N}"; MATCHES+=("exact match"); proven=$((proven + 1)) ;;
    partial|verified) mark="$OK"; match="${Y}partial match${N}"; MATCHES+=("partial match"); proven=$((proven + 1)) ;;
    *) mark="$BAD"; match="${R}not verified${N}"; MATCHES+=("not verified") ;;
  esac
  if [ "${MODS[$idx]}" != "$last_mod" ]; then
    last_mod="${MODS[$idx]}"
    echo "  ${C}${B}${last_mod}${N}"
  fi
  # pad by the visible text: colour codes would otherwise count toward the column width
  vis="${NAMES[$idx]} · ${ROLES[$idx]}"
  printf "  %s ${B}%s${N} ${DIM}· %s${N}%*s%s\n" "$mark" "${NAMES[$idx]}" "${ROLES[$idx]}" $((44 - ${#vis})) "" "$match"
  echo "      ${DIM}Address ${N} ${ADDRS[$idx]}"
  echo "      ${DIM}Explorer${N} $(hyperlink "$(link "${ADDRS[$idx]}")")"
  breathe
done

mkdir -p "$ROOT/docs/verification"
{
  echo "# AsterraPools contract verification: ${NAME}"
  echo
  echo "Chain ID ${CHAIN}. Explorer: ${EXPLORER}. Verified with \`bash scripts/verify-contracts.sh ${NETWORK}\` on $(date -u +%Y-%m-%d)."
  echo
  echo "| # | Module | Contract | Role | Address | Explorer | Match |"
  echo "|---|---|---|---|---|---|---|"
  for idx in "${!ADDRS[@]}"; do
    echo "| $((idx + 1)) | ${MODS[$idx]} | ${NAMES[$idx]} | ${ROLES[$idx]} | \`${ADDRS[$idx]}\` | [source code]($(link "${ADDRS[$idx]}")) | ${MATCHES[$idx]} |"
  done
} >"$ROOT/docs/verification/${NETWORK}.md"

echo
echo "  ${DIM}────────────────────────────────────────────────────────────────${N}"
if [ "$proven" -eq "$TOTAL" ]; then
  echo "  ${G}${B}✓ ${proven} of ${TOTAL} contracts verified on ${NAME}${N}"
else
  echo "  ${Y}${B}${proven} of ${TOTAL} contracts verified on ${NAME}${N} ${DIM}(${failed} still open)${N}"
fi
echo "  ${DIM}Saved to docs/verification/${NETWORK}.md${N}"
echo

# ------------------------------------------------------------------ 4 explore

if [ "$TTY" = 1 ]; then
  step 4 "Explore" "Pick a contract to open its verified source code on the explorer."
  for idx in "${!ADDRS[@]}"; do
    printf "  ${C}%2d${N}  %-30s ${DIM}%s${N}\n" "$((idx + 1))" "${NAMES[$idx]}" "${ROLES[$idx]}"
  done
  echo
  opener="$(command -v xdg-open || command -v open || true)"
  while :; do
    printf "  ${C}?${N} Open a contract ${DIM}[1-%d, Enter = 1, q = quit]${N} " "$TOTAL"
    read -r pick
    [ "$pick" = q ] || [ "$pick" = Q ] && break
    [ -z "$pick" ] && pick=1
    if [[ "$pick" =~ ^[0-9]+$ ]] && [ "$pick" -ge 1 ] && [ "$pick" -le "$TOTAL" ]; then
      k=$((pick - 1))
      echo "    ${B}${NAMES[$k]}${N} ${DIM}· ${ROLES[$k]}${N}  $(hyperlink "$(link "${ADDRS[$k]}")")"
      [ -n "$opener" ] && "$opener" "$(link "${ADDRS[$k]}")" >/dev/null 2>&1 &
    fi
  done
  echo
fi
[ "$proven" -eq "$TOTAL" ]
