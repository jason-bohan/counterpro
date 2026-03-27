#!/usr/bin/env python3
"""
CounterPro — AI Real Estate Negotiation Engine
Helps unrepresented buyers and FSBO sellers negotiate their own deals.

Usage:
    python negotiate.py          # interactive mode
    python negotiate.py --demo   # run with sample deal data
"""

import os
import argparse
import anthropic
from dotenv import load_dotenv

load_dotenv()

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL  = "claude-opus-4-6"


# ─────────────────────────────────────────────
# PROMPTS
# ─────────────────────────────────────────────

SYSTEM_PROMPT = """You are CounterPro, an expert real estate negotiation coach helping
everyday people negotiate their own real estate deals without a broker.

Your job is to:
1. Analyze the deal details provided
2. Recommend a specific counter-offer with clear reasoning
3. Write ready-to-send negotiation scripts (email and verbal)
4. Identify which contingencies to fight for and which to concede
5. Flag any red flags or leverage points in the deal
6. Tell them when to walk away

Be direct, specific, and practical. Use real numbers. Write scripts they can copy and paste.
Do not give vague advice — give them the exact words to say and the exact numbers to propose.
Assume the user has no real estate experience but is intelligent."""


def build_prompt(deal: dict) -> str:
    role        = deal["role"]
    prop_addr   = deal["address"]
    prop_type   = deal["property_type"]
    asking      = deal["asking_price"]
    offer       = deal["offer_received"]
    market      = deal["market_condition"]
    timeline    = deal["timeline"]
    priorities  = deal["priorities"]
    concerns    = deal["concerns"]
    extra       = deal.get("extra_context", "")

    return f"""
## Deal Details

**I am the:** {role}
**Property:** {prop_addr} ({prop_type})
**Asking price:** ${asking:,}
**Offer received:** ${offer:,}
**Market conditions:** {market}
**My timeline:** {timeline}
**My priorities:** {priorities}
**My concerns:** {concerns}
{"**Additional context:** " + extra if extra else ""}

---

Please provide a complete negotiation package including:

1. **Deal Assessment** — Is this a good deal? Where is the leverage?
2. **Recommended Counter-Offer** — Specific number with reasoning
3. **Key Terms to Negotiate** — Contingencies, closing date, inclusions, concessions
4. **Email Script** — Ready to send counter-offer email
5. **Verbal Script** — What to say if negotiating by phone or in person
6. **Red Flags** — Anything I should watch out for
7. **Walk Away Point** — At what point should I walk away from this deal?
"""


# ─────────────────────────────────────────────
# CORE ENGINE
# ─────────────────────────────────────────────

def generate_negotiation_package(deal: dict) -> str:
    """Call Claude and return the full negotiation package."""
    prompt = build_prompt(deal)

    print("\n  Analyzing your deal...\n")

    message = client.messages.create(
        model=MODEL,
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    return message.content[0].text


# ─────────────────────────────────────────────
# INPUT COLLECTION
# ─────────────────────────────────────────────

def ask(prompt: str, example: str = "") -> str:
    hint = f" (e.g. {example})" if example else ""
    val  = input(f"{prompt}{hint}: ").strip()
    return val


def collect_deal_interactive() -> dict:
    print("\n" + "=" * 55)
    print("  CounterPro — Real Estate Negotiation Coach")
    print("=" * 55)
    print("  Answer a few questions about your deal.\n")

    role = ask(
        "Are you the BUYER or SELLER",
        "buyer / seller"
    ).lower()

    address = ask(
        "Property address or description",
        "123 Main St, Austin TX / 3bed 2bath ranch"
    )

    prop_type = ask(
        "Property type",
        "single family home / condo / multi-family / land"
    )

    asking = int(ask("Asking price (numbers only)", "350000").replace(",", "").replace("$", ""))
    offer  = int(ask("Offer amount (numbers only)", "320000").replace(",", "").replace("$", ""))

    market = ask(
        "How would you describe the current market",
        "hot sellers market / balanced / buyers market / slow"
    )

    timeline = ask(
        "What is your timeline",
        "need to close in 30 days / flexible / must close by June"
    )

    priorities = ask(
        "What are your top priorities in this deal",
        "lowest price / fast close / keeping appliances / avoiding repairs"
    )

    concerns = ask(
        "What concerns do you have",
        "roof is old / buyer seems shaky / priced too high for area"
    )

    extra = ask(
        "Any other context (press Enter to skip)",
        "cash offer / first time buyer / property has been on market 60 days"
    )

    return {
        "role":           role,
        "address":        address,
        "property_type":  prop_type,
        "asking_price":   asking,
        "offer_received": offer,
        "market_condition": market,
        "timeline":       timeline,
        "priorities":     priorities,
        "concerns":       concerns,
        "extra_context":  extra,
    }


def demo_deal() -> dict:
    """Sample deal for testing."""
    return {
        "role":             "seller",
        "address":          "412 Birchwood Ave, Columbus OH",
        "property_type":    "single family home, 3bed 2bath, 1,850 sqft",
        "asking_price":     279000,
        "offer_received":   255000,
        "market_condition": "balanced market, homes selling in 30-45 days",
        "timeline":         "flexible, but would prefer to close within 60 days",
        "priorities":       "get as close to asking price as possible, prefer buyer with financing already secured",
        "concerns":         "the roof is 14 years old and buyer may use it as leverage after inspection, buyer asked for $5k in closing cost concessions",
        "extra_context":    "property has been on market 22 days, one previous offer fell through due to financing",
    }


# ─────────────────────────────────────────────
# OUTPUT
# ─────────────────────────────────────────────

def save_output(deal: dict, package: str):
    """Save the negotiation package to a text file."""
    filename = f"deal_{deal['address'][:20].replace(' ','_').replace(',','')}.txt"
    with open(filename, "w") as f:
        f.write("CounterPro — Negotiation Package\n")
        f.write("=" * 55 + "\n\n")
        f.write(f"Property: {deal['address']}\n")
        f.write(f"Role: {deal['role'].upper()}\n")
        f.write(f"Asking: ${deal['asking_price']:,} | Offer: ${deal['offer_received']:,}\n\n")
        f.write("=" * 55 + "\n\n")
        f.write(package)
    print(f"\n  📄 Saved to {filename}")


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo", action="store_true", help="Run with sample deal data")
    args = parser.parse_args()

    if args.demo:
        deal = demo_deal()
        print("\n  Running demo with sample deal...")
        print(f"  Seller asking ${deal['asking_price']:,}, received offer of ${deal['offer_received']:,}")
    else:
        deal = collect_deal_interactive()

    package = generate_negotiation_package(deal)

    print("\n" + "=" * 55)
    print("  YOUR NEGOTIATION PACKAGE")
    print("=" * 55 + "\n")
    print(package)

    save = input("\n\n  Save this to a file? (y/n): ").strip().lower()
    if save == "y":
        save_output(deal, package)


if __name__ == "__main__":
    main()
