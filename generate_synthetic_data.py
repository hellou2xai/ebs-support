"""
Generate synthetic demo data for the Vertiv Oracle EBS AMS support agentic app
("Alice" program), aligned to the REAL ticket dump.

Ground truth: data/incidents_real.csv (20 real ServiceNow incidents, sheet
Target_Incidents). Schema and reference values below match that file exactly:
the same 8 columns, the real assignment groups (Alice value streams), real close
codes, and the real systems (Agile PLM/PD, Item MDM integration, EBS, CPQ, BluJay,
Cloud2EBS/DropShip). The real 20 are carried through unchanged and enriched; the
rest is synthetic but follows the same distributions and Oracle EBS naming.

Deterministic: fixed seed, so re-running reproduces the same dataset.
All output goes to ./data as CSV.
"""

import csv
import os
import random
from datetime import datetime, timedelta

random.seed(42)
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(BASE, exist_ok=True)


def write_csv(name, header, rows):
    with open(os.path.join(BASE, name), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"wrote {name}: {len(rows)} rows")


def dt(y, m, d, h=9):
    return datetime(y, m, d, h, 0, 0).strftime("%Y-%m-%d %H:%M:%S")


# ===========================================================================
# Reference data taken from the real dump
# ===========================================================================
# Assignment group -> (value stream, primary system)
GROUPS = {
    "Oracle-Alice-Item-MDM":     ("Item-MDM", "ITEM_MDM"),
    "OMCS-ERP-Alice-QTD":        ("QTD", "EBS"),
    "Oracle-EBS-Alice-OSA-QTD":  ("QTD", "EBS"),
    "Oracle-EBS-Alice-QTD":      ("QTD", "EBS"),
    "Oracle-EBS-Alice-OSA-PTM":  ("PTM", "EBS"),
    "Oracle-EBS-Alice-PTM":      ("PTM", "EBS"),
    "OMCS-ERP-Alice-PTM":        ("PTM", "EBS"),
    "Oracle-EBS-Alice-PTC":      ("PTC", "EBS"),
    "Oracle-EBS-Alice-PTP":      ("PTP", "EBS"),
    "Oracle-EBS-Alice-Services": ("Services", "EBS"),
}
# EBS application module per value stream (Oracle short codes).
MODULE_BY_VS = {"Item-MDM": "INV", "QTD": "ONT", "PTM": "INV",
                "PTC": "AR", "PTP": "AP", "Services": "OKS"}
CLOSE_CODES = ["Configuration", "User/Training Issue", "Data Fix",
               "Known issue - no workaround", "Closed/Resolved by Caller",
               "Change related", "Functional Configuration", "Canceled", ""]
SYSTEMS = ["AGILE_PD", "ITEM_MDM", "EBS", "CPQ", "BLUJAY", "CLOUD2EBS_DROPSHIP"]

# Real Vertiv products (researched from vertiv.com / datasheets) mapped to
# numeric internal part numbers in the style the real data uses (e.g. 10077424).
VERTIV_PRODUCTS = [
    "Liebert GXT5 1500VA Online UPS 2U", "Liebert GXT5 3000VA Online UPS 2U 120V",
    "Liebert PSI5 1500VA Line-Interactive UPS 2U", "Liebert PSI5 3000VA Line-Interactive UPS 2U",
    "Liebert ITON CX 600VA UPS", "Liebert ITA2 10kW Three-Phase UPS 208V",
    "Liebert EXM2 100kW Three-Phase UPS", "Liebert APM2 Modular Three-Phase UPS",
    "Vertiv Geist MPH2 Metered Rack PDU", "Vertiv Geist MPH2 Managed Rack PDU",
    "Vertiv Geist Rack Transfer Switch 1U 20A", "Vertiv VR Rack 42U 600x1200mm",
    "Vertiv VR Rack 42U 800x1200mm", "Vertiv SmartCabinet2-E Integrated Edge Cabinet",
    "Vertiv SmartRow 2 Edge Data Centre", "Liebert CRV In-Row Cooling 35kW",
    "Liebert PDX Compact DX Cooling 29kW", "Liebert DSE Free-Cooling 100kW",
    "Liebert RDU501 Monitoring Gateway", "Liebert IntelliSlot RDU101 Comms Card",
    "Liebert GXT5 External Battery Cabinet 144V 2U",
]
# Build a numeric item master (SEGMENT1 like the real 10077424 / 60140480P1 style)
random.shuffle(VERTIV_PRODUCTS)
ITEMS = []  # (segment1, description, category)
base_pn = 10070000
for i, desc in enumerate(VERTIV_PRODUCTS):
    pn = str(base_pn + random.randint(1000, 9000) + i * 137)
    if random.random() > 0.6:
        pn += "P1"  # phantom/config variant suffix as seen in real data
    cat = ("UPS" if "UPS" in desc else "PDU" if "PDU" in desc else "Rack" if "Rack" in desc
           else "Thermal" if ("Cooling" in desc or "CRV" in desc or "DSE" in desc or "PDX" in desc)
           else "Integrated" if ("Smart" in desc) else "Monitoring" if "RDU" in desc or "Monitoring" in desc
           else "Battery" if "Battery" in desc else "Transfer Switch" if "Transfer" in desc else "Other")
    ITEMS.append((pn, desc, cat))


# ===========================================================================
# incidents.csv : the real 20 (verbatim core) + synthetic, all enriched
# ===========================================================================
# Real 20, with the enrichment the agent would add (value stream, system, pattern,
# root cause, resolution type, linked/recreated ticket, recurring flag).
# REAL_INCIDENTS rows: number, theme, group, opened, closed, close_code,
#                      pattern, rca, resolution_type, linked, recurring
REAL = [
    ("INC0903771", "Item MDM integration issue", "Oracle-Alice-Item-MDM", dt(2025,3,4), dt(2025,3,16), "Change related",
     "PAT-REV-SYNC", "RCA-01", "Change/Code", "INC0877704", "Y"),
    ("INC0903826", "Revision sync issue", "Oracle-Alice-Item-MDM", dt(2025,3,4), dt(2025,3,15), "User/Training Issue",
     "PAT-REV-SYNC", "RCA-01", "Integration", "INC0877704", "Y"),
    ("INC0934551", "Order progression / holds", "OMCS-ERP-Alice-QTD", dt(2025,5,14), dt(2025,5,31), "Known issue - no workaround",
     "PAT-HOLD", "RCA-04", "Manual hold release", "", "N"),
    ("INC0928344", "Autocreate config hold", "Oracle-EBS-Alice-OSA-QTD", dt(2025,4,30), dt(2025,6,2), "Known issue - no workaround",
     "PAT-HOLD", "RCA-04", "Manual hold release", "", "N"),
    ("INC0933232", "Planning system issue", "Oracle-EBS-Alice-PTM", dt(2025,5,12), dt(2025,6,2), "",
     "PAT-PEG", "RCA-09", "No user response", "", "N"),
    ("INC0932356", "Warehouse/plant sync issue", "OMCS-ERP-Alice-QTD", dt(2025,5,9), dt(2025,6,5), "Configuration",
     "PAT-PLANT", "RCA-10", "Config workaround", "", "N"),
    ("INC0979873", "CPQ/EBS submission failure", "Oracle-EBS-Alice-QTD", dt(2025,8,29), dt(2025,9,6), "Configuration",
     "PAT-CPQ", "RCA-07", "Config fix", "", "N"),
    ("INC0978839", "CCO creation inconsistency", "Oracle-Alice-Item-MDM", dt(2025,8,27), dt(2025,9,6), "Closed/Resolved by Caller",
     "PAT-CCO", "RCA-02", "Caller resolved", "INC0925593", "Y"),
    ("INC1008688", "Daily order processing outage", "Oracle-EBS-Alice-OSA-PTM", dt(2025,11,14), dt(2025,11,23), "Configuration",
     "PAT-APPTREE", "RCA-08", "Config fix", "", "N"),
    ("INC0985051", "Integration failure", "Oracle-EBS-Alice-OSA-PTM", dt(2025,9,15), dt(2025,9,18), "Configuration",
     "PAT-BLUJAY", "RCA-06", "Config fix", "", "N"),
    ("INC0909168", "Revenue/order lifecycle", "OMCS-ERP-Alice-QTD", dt(2025,3,17), dt(2025,7,27), "Configuration",
     "PAT-SOREOPEN", "RCA-11", "No user response", "", "N"),
    ("INC0998890", "Receiving transaction stuck", "OMCS-ERP-Alice-PTM", dt(2025,10,21), dt(2025,11,29), "Data Fix",
     "PAT-RCV", "RCA-05", "Data fix SBM-090351", "INC0985197", "Y"),
    ("INC0899046", "CCB processing issue", "Oracle-Alice-Item-MDM", dt(2025,2,21), dt(2025,2,28), "User/Training Issue",
     "PAT-CCB-REV", "RCA-03", "Reject CO, re-sequence revision", "", "N"),
    ("INC0899823", "Data corruption / order cancellation", "OMCS-ERP-Alice-QTD", dt(2025,2,24), dt(2025,3,3), "Data Fix",
     "PAT-DROPSHIP", "RCA-12", "Data fix", "", "Y"),
    ("INC0899936", "Revenue recognition issue", "Oracle-EBS-Alice-PTC", dt(2025,2,24), dt(2025,3,3), "Functional Configuration",
     "PAT-OBLIG", "RCA-13", "Functional config", "", "N"),
    ("INC0899839", "Duplicate CCO generation", "Oracle-Alice-Item-MDM", dt(2025,2,24), dt(2025,3,3), "User/Training Issue",
     "PAT-CCO", "RCA-02", "Revision/CO correction", "INC0890340", "Y"),
    ("INC0899788", "NRCO/CCB integration issue", "Oracle-Alice-Item-MDM", dt(2025,2,24), dt(2025,3,1), "Closed/Resolved by Caller",
     "PAT-CCB-REV", "RCA-03", "Caller resolved", "", "N"),
    ("INC0899829", "Data corruption / order cancellation", "OMCS-ERP-Alice-QTD", dt(2025,2,24), dt(2025,3,6), "Data Fix",
     "PAT-DROPSHIP", "RCA-12", "Data fix applied", "", "Y"),
    ("INC0897635", "Contract generation anomaly", "Oracle-EBS-Alice-Services", dt(2025,2,19), dt(2025,2,20), "",
     "PAT-CONTRACT", "RCA-14", "Oracle SR raised", "", "N"),
    ("INC0899325", "Scheduling/debrief systemic issue", "Oracle-EBS-Alice-Services", dt(2025,2,21), dt(2025,2,24), "Canceled",
     "PAT-CONTRACT", "RCA-14", "Cancelled", "", "N"),
]
# Pull the verbatim short_description and close_notes from the exported real file
real_text = {}
seed_path = os.path.join(BASE, "incidents_real.csv")
if os.path.exists(seed_path):
    with open(seed_path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            real_text[r["INCIDENT_NUMBER"]] = (r["SHORT_DESCRIPTION"], r["CLOSE_NOTES"])

BASE_HDR = ["BUSINESS_IMPACT_THEME", "INCIDENT_NUMBER", "SHORT_DESCRIPTION",
       "ASSIGNMENT_GROUP", "OPENED_AT", "CLOSED_AT", "CLOSE_CODE", "CLOSE_NOTES",
       "VALUE_STREAM", "PRIMARY_SYSTEM", "PATTERN_ID", "ROOT_CAUSE_ID",
       "RESOLUTION_TYPE", "LINKED_INCIDENT", "RECURRING_FLAG", "DATA_ORIGIN"]
# Added: real ServiceNow + EBS metadata, and AR/AP business context.
META_HDR = ["EBS_MODULE", "OPENED_BY", "ASSIGNED_TO", "PRIORITY", "IMPACT",
            "URGENCY", "STATE", "SLA_DUE", "INVOICE_AMOUNT", "CURRENCY",
            "COUNTERPARTY", "COUNTERPARTY_TYPE", "COUNTERPARTY_TIER",
            "FINANCIAL_BAND", "BUSINESS_FLAGS"]
HDR = BASE_HDR + META_HDR

# --- Master data: customers and suppliers (synthetic, with tiers) ---
CUSTOMERS = [  # name, tier, segment, region
    ("Atlas Colocation", "Strategic", "Colocation", "AMER"),
    ("Northwind Hyperscale", "Strategic", "Hyperscale", "AMER"),
    ("Meridian Telecom", "Strategic", "Telco", "EMEA"),
    ("Summit Data Centers", "High-Value", "Colocation", "AMER"),
    ("Cascade Cloud", "High-Value", "Cloud", "APAC"),
    ("Helios Financial Group", "High-Value", "BFSI", "EMEA"),
    ("Orion Health Systems", "Standard", "Healthcare", "AMER"),
    ("Brightline Logistics", "Standard", "Logistics", "AMER"),
    ("Granite Manufacturing", "Standard", "Industrial", "EMEA"),
    ("Pioneer University", "Standard", "Education", "AMER"),
]
SUPPLIERS = [  # name, tier, category, single_source
    ("Cellcore Battery Systems", "Critical-Component", "Batteries", "Y"),
    ("Volt Semiconductors", "Critical-Component", "Power semiconductors", "Y"),
    ("CapaciTech Components", "Critical-Component", "Capacitors", "N"),
    ("PrecisionMag Magnetics", "Strategic", "Transformers and inductors", "N"),
    ("ThermaFlow Cooling", "Strategic", "Cooling fans", "N"),
    ("CircuitForm PCB", "Strategic", "Printed circuit boards", "Y"),
    ("SteelForm Enclosures", "Approved", "Sheet metal", "N"),
    ("Apex Fasteners", "Approved", "Hardware", "N"),
    ("Lumen Wire and Cable", "Approved", "Cabling", "N"),
]
write_csv("customers.csv", ["CUSTOMER_NAME", "TIER", "SEGMENT", "REGION"], CUSTOMERS)
write_csv("suppliers.csv", ["SUPPLIER_NAME", "TIER", "CATEGORY", "SINGLE_SOURCE"], SUPPLIERS)

# Caller (business user) and engineer pools for opened_by / assigned_to.
CALLERS = ["Racquel Tan", "Melanie Cruz", "James Whitfield", "Mark Olsen",
           "Amanpreet Kaur", "Diego Alvarez", "Sara Lindqvist", "Kenji Watanabe",
           "Fatima Noor", "Liam Donovan", "Grace Mwangi", "Tomas Novak"]
ENG_BY_VS = {
    "Item-MDM": ["Meet Meghani", "Greta Hoffmann"],
    "QTD": ["Vikram Raju", "Wei Zhang"],
    "PTM": ["Wei Zhang", "Anil Kapoor"],
    "PTC": ["Ravi Menon", "James Whitfield"],
    "PTP": ["James Whitfield", "Anil Kapoor"],
    "Services": ["Soumya Iyer", "Ravi Menon"],
}
SLA_HOURS = {"P1": 4, "P2": 8, "P3": 24, "P4": 72}


def parse_dt(s):
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")


def sla_due(opened, prio):
    return (parse_dt(opened) + timedelta(hours=SLA_HOURS[prio])).strftime("%Y-%m-%d %H:%M:%S")


incident_rows = []  # base 16-col rows; metadata appended in a post-pass
ar_rows, ap_rows = [], []
fin_ctx = {}  # incident -> (amount, currency, counterparty, cp_type, cp_tier, band, flags)
for (num, theme, group, opened, closed, code, pat, rca, restype, linked, recur) in REAL:
    vs, sysm = GROUPS[group]
    sd, notes = real_text.get(num, ("", ""))
    incident_rows.append([theme, num, sd, group, opened, closed, code, notes,
                          vs, sysm, pat, rca, restype, linked, recur, "REAL"])

# Synthetic expansion: more incidents in the same shape and distribution.
SYN_THEMES = {
    "PAT-REV-SYNC": ("Revision sync issue", "Oracle-Alice-Item-MDM", "RCA-01",
                     "Item {item} revision mismatch: PD shows {ra} but EBS shows 00 after {co} not interfaced"),
    "PAT-CCO": ("CCO creation inconsistency", "Oracle-Alice-Item-MDM", "RCA-02",
                "{cco} created under {co} but no revised items fetched, CCB report error"),
    "PAT-CCB-REV": ("CCB processing issue", "Oracle-Alice-Item-MDM", "RCA-03",
                    "CCB report error for {co}: old revision higher than new revision"),
    "PAT-HOLD": ("Order progression / holds", "OMCS-ERP-Alice-QTD", "RCA-04",
                 "Order {order} lines on Autocreate Config Exception hold, cannot progress"),
    "PAT-RCV": ("Receiving transaction stuck", "OMCS-ERP-Alice-PTM", "RCA-05",
                "Receiving issue DN {dn}: stuck in RCV_INTERFACE, quantity shows 0"),
    "PAT-BLUJAY": ("Integration failure", "Oracle-EBS-Alice-OSA-PTM", "RCA-06",
                   "Delivery {dn} not transmitting from EBS to BluJay"),
    "PAT-CPQ": ("CPQ/EBS submission failure", "Oracle-EBS-Alice-QTD", "RCA-07",
                "{quote} unable to submit order due to error"),
    "PAT-APPTREE": ("Daily order processing outage", "Oracle-EBS-Alice-OSA-PTM", "RCA-08",
                    "APPTREE_EVENT error in Oracle EBS blocking order processing"),
    "PAT-PEG": ("Planning system issue", "Oracle-EBS-Alice-PTM", "RCA-09",
                "Hard pegging issue for item {item} in Test and Production"),
    "PAT-PLANT": ("Warehouse/plant sync issue", "OMCS-ERP-Alice-QTD", "RCA-10",
                  "Unable to change plant on order {order} due to validation error"),
    "PAT-DROPSHIP": ("Data corruption / order cancellation", "OMCS-ERP-Alice-QTD", "RCA-12",
                     "Order {order} data corruption: PO not unlinked after DropShip cancellation"),
    "PAT-OBLIG": ("Revenue recognition issue", "Oracle-EBS-Alice-PTC", "RCA-13",
                  "Obligation error for Project {proj} SO {so}, cannot recognize revenue"),
}
SYN_CLOSE = {
    "Configuration": "Issue resolved via configuration change. User validated and confirmed.",
    "Data Fix": "Records stuck in interface table. Data fix applied to clear and reprocess.",
    "User/Training Issue": "Root cause explained to user. Correct procedure provided.",
    "Functional Configuration": "Functional setup corrected. User able to proceed.",
    "Change related": "Fix deployed to production via change. Please confirm closure.",
    "Known issue - no workaround": "Known issue. Holds removed to allow progression.",
}
syn_num = 1100000
for k in range(60):
    pat = random.choice(list(SYN_THEMES.keys()))
    theme, group, rca, sdt = SYN_THEMES[pat]
    vs, sysm = GROUPS[group]
    item = random.choice(ITEMS)[0]
    sd = sdt.format(
        item=item, ra=random.choice(["A", "B", "C"]),
        co=f"CO-{1100000 + random.randint(0, 90000)}",
        cco=f"CCO-{96000 + random.randint(0, 400)}",
        order=str(130000 + random.randint(0, 90000)),
        dn=str(2300000 + random.randint(0, 500000)),
        quote=f"CPQ-{900000 + random.randint(0, 90000)}",
        proj=str(210000 + random.randint(0, 9000)),
        so=str(5000000 + random.randint(0, 90000)),
    )
    code = random.choice(["Configuration", "Data Fix", "User/Training Issue",
                          "Functional Configuration", "Change related",
                          "Known issue - no workaround"])
    recur = "Y" if random.random() > 0.6 else "N"
    linked = f"INC{800000 + random.randint(0, 90000)}" if recur == "Y" else ""
    restype = {"Data Fix": "Data fix", "Configuration": "Config fix",
               "User/Training Issue": "User guidance", "Change related": "Change/Code",
               "Functional Configuration": "Functional config",
               "Known issue - no workaround": "Manual workaround"}[code]
    om = random.randint(1, 11)
    syn_num += random.randint(11, 380)
    num = f"INC{syn_num}"
    incident_rows.append([theme, num, sd, group, dt(2025, om, random.randint(1, 27)),
                          dt(2025, min(om + 1, 12), random.randint(1, 27)), code,
                          SYN_CLOSE.get(code, "Issue resolved."), vs, sysm, pat, rca,
                          restype, linked, recur, "SYNTHETIC"])

# --- AR / AP interface error incidents, enriched with business context ---
QUARTER_END = {3, 6, 9, 12}
AR_ERRORS = [
    ("No Revenue Account found for batch source", "RAXMTR / AutoAccounting"),
    ("GL period not open for the accounting date", "AutoInvoice"),
    ("Invalid tax rate code for ship-to site", "AutoInvoice"),
    ("Duplicate transaction number in interface", "AutoInvoice"),
    ("Invalid memo line / inventory item", "AutoInvoice"),
]
AP_ERRORS = [
    ("PO quantity received less than billed", "matching"),
    ("Unit price exceeds PO price tolerance", "price hold"),
    ("Supplier site has no tax registration", "validation"),
    ("Distribution account combination invalid", "validation"),
    ("No matching purchase order line", "matching"),
]


def fin_band(amount):
    if amount >= 500000: return "Critical"
    if amount >= 250000: return "High"
    if amount >= 50000: return "Medium"
    return "Low"


def fin_flags(amount, band, cp_tier, single_source, period_month, recur):
    flags = []
    if band in ("High", "Critical"): flags.append("High-value invoice")
    if cp_tier in ("Strategic", "High-Value"): flags.append("Strategic customer")
    if cp_tier == "Critical-Component": flags.append("Critical component supplier")
    if single_source == "Y": flags.append("Single-source supplier")
    if period_month in QUARTER_END: flags.append("Quarter-close risk")
    if recur == "Y": flags.append("Recurring issue")
    return ";".join(flags)


ar_num = 1120000
for n in range(14):
    cust = random.choice(CUSTOMERS)
    amount = round(random.choice([random.uniform(5000, 60000), random.uniform(80000, 300000), random.uniform(300000, 800000)]), 2)
    band = fin_band(amount)
    err, where = random.choice(AR_ERRORS)
    om = random.randint(1, 11)
    recur = "Y" if random.random() > 0.6 else "N"
    band_flags = fin_flags(amount, band, cust[1], "N", om, recur)
    ar_num += random.randint(11, 120)
    num = f"INC{ar_num}"
    trx = f"VTV-{2400000 + random.randint(0, 90000)}"
    sd = f"AR AutoInvoice rejection for {cust[0]} invoice {trx} (${amount:,.0f}): {err}"
    code = random.choice(["Data Fix", "Functional Configuration", "Configuration"])
    incident_rows.append([
        "AR invoice interface error", num, sd, "Oracle-EBS-Alice-PTC",
        dt(2025, om, random.randint(1, 27)), dt(2025, min(om + 1, 12), random.randint(1, 27)),
        code, "AutoInvoice rejection cleared; invoice imported after correction.",
        "PTC", "EBS", "PAT-AR-AUTOINV", "RCA-AR1",
        "Data fix" if code == "Data Fix" else "Functional config",
        (f"INC{800000 + random.randint(0, 90000)}" if recur == "Y" else ""), recur, "SYNTHETIC",
    ])
    fin_ctx[num] = (amount, "USD", cust[0], "Customer", cust[1], band, band_flags)
    ar_rows.append([8800000 + random.randint(0, 90000), trx, cust[0], cust[1],
                    random.choice(["Vertiv US OU", "Vertiv EMEA OU"]), amount, "USD",
                    "CPQ_ORDERS", err, random.choice(["JUN-25", "MAR-25", "SEP-25", "DEC-24"]), num])

ap_num = 1140000
for n in range(14):
    sup = random.choice(SUPPLIERS)
    amount = round(random.choice([random.uniform(8000, 70000), random.uniform(90000, 350000), random.uniform(350000, 900000)]), 2)
    band = fin_band(amount)
    err, kind = random.choice(AP_ERRORS)
    om = random.randint(1, 11)
    recur = "Y" if random.random() > 0.6 else "N"
    band_flags = fin_flags(amount, band, sup[1], sup[3], om, recur)
    ap_num += random.randint(11, 120)
    num = f"INC{ap_num}"
    invn = f"AP-{700000 + random.randint(0, 90000)}"
    po = f"PO-{4500000 + random.randint(0, 90000)}"
    sd = f"AP invoice {invn} from {sup[0]} (${amount:,.0f}) failed import: {err}"
    code = random.choice(["Data Fix", "Configuration", "Known issue - no workaround"])
    hold = "Qty Rec Hold" if kind == "matching" else "Price Hold" if kind == "price hold" else ""
    incident_rows.append([
        "AP invoice interface error", num, sd, "Oracle-EBS-Alice-PTP",
        dt(2025, om, random.randint(1, 27)), dt(2025, min(om + 1, 12), random.randint(1, 27)),
        code, "Payables Open Interface rejection resolved; invoice validated.",
        "PTP", "EBS", "PAT-AP-IMPORT" if kind != "price hold" else "PAT-AP-HOLD",
        "RCA-AP1" if kind == "matching" else "RCA-AP2" if kind == "price hold" else "RCA-AP3",
        "Data fix" if code == "Data Fix" else "Config fix",
        (f"INC{800000 + random.randint(0, 90000)}" if recur == "Y" else ""), recur, "SYNTHETIC",
    ])
    fin_ctx[num] = (amount, "USD", sup[0], "Supplier", sup[1], band, band_flags)
    ap_rows.append([9100000 + random.randint(0, 90000), invn, sup[0], sup[1], po, amount, "USD",
                    err, hold, "UNMATCHED" if kind == "matching" else "MATCHED", num])

# --- Metadata post-pass: module, opened_by, assignee, priority, state, SLA, business ctx ---
STATES_OPEN = ["New", "In Progress", "On Hold", "In Progress", "In Progress"]
final_rows = []
for r in incident_rows:
    num, group, opened, vs = r[1], r[3], r[4], r[8]
    recur = r[14]
    fc = fin_ctx.get(num)
    amount = fc[0] if fc else ""
    currency = fc[1] if fc else ""
    counterparty = fc[2] if fc else ""
    cp_type = fc[3] if fc else ""
    cp_tier = fc[4] if fc else ""
    band = fc[5] if fc else ""
    flags = fc[6] if fc else ("Recurring issue" if recur == "Y" else "")
    module = "AR" if vs == "PTC" else "AP" if vs == "PTP" else MODULE_BY_VS.get(vs, "ONT")
    # priority from financial band / flags / recurrence
    if band == "Critical" or "High-value invoice" in flags and "Strategic" in flags:
        prio = "P1"
    elif band == "High" or "Strategic customer" in flags or "Critical component supplier" in flags:
        prio = "P2"
    elif recur == "Y":
        prio = "P2"
    else:
        prio = random.choice(["P3", "P3", "P4"])
    impact = {"P1": "High", "P2": "Medium", "P3": "Medium", "P4": "Low"}[prio]
    urgency = {"P1": "High", "P2": "High", "P3": "Medium", "P4": "Low"}[prio]
    state = random.choice(STATES_OPEN)
    caller = random.choice(CALLERS)
    assignee = random.choice(ENG_BY_VS.get(vs, ["Anil Kapoor"]))
    meta = [module, caller, assignee, prio, impact, urgency, state, sla_due(opened, prio),
            (f"{amount:.2f}" if isinstance(amount, float) else ""), currency,
            counterparty, cp_type, cp_tier, band, flags]
    final_rows.append(r + meta)
incident_rows = final_rows
write_csv("incidents.csv", HDR, incident_rows)

write_csv("ar_invoice_interface.csv",
          ["INTERFACE_LINE_ID", "TRX_NUMBER", "BILL_TO_CUSTOMER", "CUSTOMER_TIER",
           "OPERATING_UNIT", "AMOUNT", "CURRENCY", "BATCH_SOURCE", "ERROR_MESSAGE",
           "PERIOD_NAME", "INCIDENT_NUMBER"], ar_rows)
write_csv("ap_invoice_interface.csv",
          ["INVOICE_ID", "INVOICE_NUM", "SUPPLIER_NAME", "SUPPLIER_TIER", "PO_NUMBER",
           "AMOUNT", "CURRENCY", "REJECTION_REASON", "HOLD_NAME", "MATCH_STATUS",
           "INCIDENT_NUMBER"], ap_rows)


# ===========================================================================
# item_master.csv  (MTL_SYSTEM_ITEMS_B style, numeric Vertiv part numbers)
# ===========================================================================
INV_ORGS = [(231, "USM"), (232, "USW"), (241, "EMW"), (251, "APW"), (261, "MX1")]
rows = []
for iid, (seg1, desc, cat) in enumerate(ITEMS, start=5101):
    for org in random.sample(INV_ORGS, k=random.randint(2, 5)):
        rows.append([iid, seg1, desc, cat, "FG", "Ea", org[0], org[1],
                     "Active", "Y", "Y", "Y"])
write_csv("item_master.csv",
          ["INVENTORY_ITEM_ID", "SEGMENT1", "DESCRIPTION", "ITEM_CATEGORY",
           "ITEM_TYPE", "PRIMARY_UOM_CODE", "ORGANIZATION_ID", "ORGANIZATION_CODE",
           "INVENTORY_ITEM_STATUS_CODE", "CUSTOMER_ORDER_ENABLED_FLAG",
           "SHIPPABLE_ITEM_FLAG", "INVOICE_ENABLED_FLAG"], rows)


# ===========================================================================
# item_revisions.csv  (PD/Agile -> EBS revision sync, the Item-MDM core)
#   MTL_ITEM_REVISIONS_B vs Agile rev; change orders CO/CCO/NRCO/ECO
# ===========================================================================
CO_TYPES = ["CO", "CCO", "NRCO", "ECO"]
rows = []
for inc in ["INC0903826", "INC0903771", "INC0978839", "INC0899839", "INC0899046",
            "INC0899788"] + [f"S{n}" for n in range(20)]:
    item = random.choice(ITEMS)
    pd_rev = random.choice(["A", "B", "C", "D"])
    interfaced = random.random() > 0.45
    ebs_rev = pd_rev if interfaced else "00"
    cot = random.choice(CO_TYPES)
    rows.append([
        item[0], item[1], pd_rev, ebs_rev,
        f"{cot}-{1000000 + random.randint(0, 200000)}", cot,
        "INTERFACED" if interfaced else "NOT_INTERFACED",
        "Y" if interfaced else "N",
        "ItemWB used after CO" if (not interfaced and random.random() > 0.6) else "",
        inc if inc.startswith("INC") else "",
    ])
write_csv("item_revisions.csv",
          ["ITEM_NUMBER", "DESCRIPTION", "PD_REVISION", "EBS_REVISION",
           "CHANGE_ORDER", "CO_TYPE", "INTERFACE_STATUS", "SYNCED_FLAG",
           "NOTE", "INCIDENT_NUMBER"], rows)


# ===========================================================================
# order_holds.csv  (ONT: OE_ORDER_HOLDS_ALL, incl Autocreate Config Exception)
# ===========================================================================
HOLDS = ["Autocreate Config Exception", "Credit Check Failure", "Buy-Out Hold",
         "Export Compliance Hold", "Margin Hold", "Configuration Validation Hold"]
rows = []
for inc in ["INC0934551", "INC0928344"] + [f"S{n}" for n in range(18)]:
    ou = random.choice([(101, "Vertiv US OU"), (102, "Vertiv EMEA OU"), (103, "Vertiv APAC OU")])
    hold = random.choice(HOLDS)
    cleared = "Y" if random.random() > 0.5 else "N"
    rows.append([
        7000000 + random.randint(0, 90000), 130000 + random.randint(0, 90000),
        f"{random.randint(1,30)}.{random.randint(1,7)}",
        ou[0], ou[1], hold, "O",
        random.choice(ITEMS)[0], dt(2025, random.randint(2, 11), random.randint(1, 27)),
        "N", cleared, inc if inc.startswith("INC") else "",
    ])
write_csv("order_holds.csv",
          ["HEADER_ID", "ORDER_NUMBER", "LINE_NUMBER", "ORG_ID", "OPERATING_UNIT",
           "HOLD_NAME", "HOLD_TYPE_CODE", "ITEM_NUMBER", "HOLD_APPLIED_DATE",
           "RELEASED_FLAG", "CONDITION_CLEARED_FLAG", "INCIDENT_NUMBER"], rows)


# ===========================================================================
# dropship_orders.csv  (DropShip PO link, the recurring data-corruption source)
# ===========================================================================
rows = []
for inc in ["INC0899823", "INC0899829"] + [f"S{n}" for n in range(14)]:
    cancelled = random.random() > 0.4
    po_unlinked = "Y" if (cancelled and random.random() > 0.55) else "N"
    corrupt = "Y" if (cancelled and po_unlinked == "N") else "N"
    rows.append([
        130000 + random.randint(0, 90000), f"{random.randint(1,20)}.1",
        random.choice(ITEMS)[0],
        f"PO-{4500000 + random.randint(0, 90000)}",
        "CANCELLED" if cancelled else "OPEN",
        po_unlinked, corrupt, "CLOUD2EBS_DROPSHIP",
        inc if inc.startswith("INC") else "",
    ])
write_csv("dropship_orders.csv",
          ["ORDER_NUMBER", "LINE_NUMBER", "ITEM_NUMBER", "PO_NUMBER",
           "ORDER_STATUS", "PO_UNLINKED_FLAG", "DATA_CORRUPTION_FLAG",
           "SOURCE_SYSTEM", "INCIDENT_NUMBER"], rows)


# ===========================================================================
# rcv_interface.csv  (PTM receiving: stuck rows in RCV_INTERFACE)
# ===========================================================================
rows = []
for inc in ["INC0998890"] + [f"S{n}" for n in range(15)]:
    stuck = random.random() > 0.4
    rows.append([
        9000000 + random.randint(0, 90000),
        2300000 + random.randint(0, 500000),  # DELIVERY_NOTE
        random.choice(ITEMS)[0], random.randint(1, 10), 0 if stuck else random.randint(1, 10),
        "PENDING" if stuck else "TRANSACTED",
        "ERROR" if stuck else "SUCCESS",
        "Y" if stuck else "N",  # NEEDS_DATA_FIX
        inc if inc.startswith("INC") else "",
    ])
write_csv("rcv_interface.csv",
          ["INTERFACE_TRANSACTION_ID", "DELIVERY_NOTE", "ITEM_NUMBER",
           "EXPECTED_QTY", "RECEIVED_QTY", "RECEIPT_STATUS", "PROCESSING_STATUS",
           "NEEDS_DATA_FIX", "INCIDENT_NUMBER"], rows)


# ===========================================================================
# cpq_submissions.csv  (CPQ -> EBS order submission)
# ===========================================================================
rows = []
for inc in ["INC0979873"] + [f"S{n}" for n in range(14)]:
    ok = random.random() > 0.5
    rows.append([
        f"CPQ-{900000 + random.randint(0, 90000)}",
        (1300000 + random.randint(0, 90000)) if ok else "",
        random.choice(ITEMS)[0],
        "SUBMITTED" if ok else "ERROR",
        "" if ok else random.choice(["Item not orderable in org", "Pricing validation failed",
                                      "Serviceability mapping missing", "ORA-20001 in Process_Order"]),
        inc if inc.startswith("INC") else "",
    ])
write_csv("cpq_submissions.csv",
          ["QUOTE_NUMBER", "EBS_ORDER_NUMBER", "ITEM_NUMBER", "SUBMISSION_STATUS",
           "ERROR_MESSAGE", "INCIDENT_NUMBER"], rows)


# ===========================================================================
# blujay_transmissions.csv  (EBS -> BluJay delivery transmission)
# ===========================================================================
rows = []
for inc in ["INC0985051"] + [f"S{n}" for n in range(14)]:
    ok = random.random() > 0.45
    rows.append([
        2700000 + random.randint(0, 90000),  # DELIVERY_ID
        f"MSG-{8000000 + random.randint(0, 90000)}",
        "EBS", "BLUJAY", "TRANSMITTED" if ok else "FAILED",
        "" if ok else random.choice(["Endpoint timeout", "Missing carrier mapping",
                                      "Payload schema mismatch"]),
        random.randint(0, 4), "Y" if not ok else "N",
        inc if inc.startswith("INC") else "",
    ])
write_csv("blujay_transmissions.csv",
          ["DELIVERY_ID", "MESSAGE_ID", "SOURCE_SYSTEM", "TARGET_SYSTEM",
           "STATUS", "ERROR_MESSAGE", "RETRY_COUNT", "REPLAYABLE_FLAG",
           "INCIDENT_NUMBER"], rows)


# ===========================================================================
# revenue_obligations.csv  (PTC: revenue recognition / obligations)
# ===========================================================================
rows = []
for inc in ["INC0899936", "INC0909168"] + [f"S{n}" for n in range(12)]:
    blocked = random.random() > 0.4
    rows.append([
        210000 + random.randint(0, 9000),       # PROJECT_NUMBER
        5000000 + random.randint(0, 90000),      # SALES_ORDER
        f"OBL-{700000 + random.randint(0, 90000)}",
        random.choice(["JUN-25", "MAY-25", "APR-25", "MAR-25"]),
        round(random.uniform(5000, 450000), 2),
        "BLOCKED" if blocked else "RECOGNIZED",
        random.choice(["Obligation publishing error", "Revenue contingency not met",
                       "Agreement-SO mismatch"]) if blocked else "",
        inc if inc.startswith("INC") else "",
    ])
write_csv("revenue_obligations.csv",
          ["PROJECT_NUMBER", "SALES_ORDER", "OBLIGATION_ID", "PERIOD_NAME",
           "AMOUNT", "REV_REC_STATUS", "BLOCK_REASON", "INCIDENT_NUMBER"], rows)


# ===========================================================================
# root_cause_analysis.csv  (resolve at source: symptom -> root -> permanent fix)
# ===========================================================================
RCAS = [
    ("RCA-01", "Item-MDM", "EBS item revision stuck at 00 while PD shows A/B",
     "Repush change order or apply revision data fix",
     "Change order (NRCO/CO) not interfaced due to integration failure; Item Workbench used afterwards does not update revision",
     "ITEM_MDM + AGILE_PD", "MTL_ITEM_REVISIONS_B / CO interface",
     "Idempotent CO/NRCO interface with retry, alerting, and a guard that blocks Item Workbench edits on items with a pending CO interface",
     "Integration/Code", "High", "INC0903826;INC0903771;INC0877704"),
    ("RCA-02", "Item-MDM", "CCO created with no revised items fetched / wrong CO",
     "Identify correct CO, recreate CCO with valid revision",
     "Revision sequencing not validated before CCO creation; latest ECO revision conflicts",
     "AGILE_PD + ITEM_MDM", "CCO creation API / CCB report",
     "Pre-validate revision ordering and CO linkage before CCO creation; surface CCB errors at submission",
     "Config/Code", "Medium", "INC0978839;INC0899839;INC0890340;INC0925593"),
    ("RCA-03", "Item-MDM", "CCB report error: old revision higher than new revision",
     "Reject CO, move to pending, use a greater revision, re-push",
     "No revision-sequence validation at change-order entry in PD",
     "AGILE_PD", "Change order entry / revision rule",
     "Enforce a revision-sequence rule at PD change-order entry so a lower new revision is rejected before it reaches EBS",
     "Config/Process", "Low", "INC0899046;INC0899788"),
    ("RCA-04", "QTD", "Order lines cannot progress due to holds",
     "Manually remove/release holds on the lines",
     "Autocreate Config Exception and buy-out holds applied automatically with no auto-release rule once the condition clears",
     "EBS ONT", "OE_ORDER_HOLDS_ALL",
     "Automated hold-release workflow that releases config-exception holds when the configuration validates and PR/PO conditions clear",
     "Config/Integration", "Medium", "INC0934551;INC0928344"),
    ("RCA-05", "PTM", "Receiving stuck, quantity shows 0, rows in RCV_INTERFACE",
     "Data fix to clear RCV_INTERFACE rows (e.g. SBM-090351), reprocess",
     "Receiving Transaction Manager does not reprocess errored rows; no monitoring of RCV_INTERFACE",
     "EBS INV/PO", "RCV_INTERFACE / RCV_TRANSACTIONS_INTERFACE",
     "Monitor RCV_INTERFACE for stuck rows and auto-reprocess; catalogue the clear-and-reprocess data fix",
     "Code/Process", "Medium", "INC0998890;INC0985197"),
    ("RCA-06", "PTM", "EBS deliveries not transmitting to BluJay",
     "Reprocess/replay the transmission",
     "EBS-to-BluJay interface has no retry or monitoring; mapping/endpoint failures go silent",
     "EBS + BLUJAY", "EBS-BluJay shipping interface",
     "Add retry, dead-letter and monitoring on the BluJay interface; alert on failed transmissions",
     "Integration", "Medium", "INC0985051"),
    ("RCA-07", "QTD", "CPQ quote cannot submit order to EBS",
     "Apply configuration fix, resubmit quote",
     "Item orderability / serviceability / pricing setup gaps for new products in the selling org",
     "CPQ + EBS", "Order import / item setup",
     "Pre-submit validation in CPQ for orderability, pricing and serviceability before the order reaches EBS",
     "Config", "Low", "INC0979873"),
    ("RCA-08", "PTM", "APPTREE_EVENT error causes daily order processing outage",
     "Configuration fix to the event/concurrent process",
     "Custom APPTREE_EVENT handler fails under specific data conditions with no guard or alert",
     "EBS (custom)", "APPTREE_EVENT custom code",
     "Fix the APPTREE_EVENT handler for the failing condition and add monitoring on the daily run",
     "Code", "Medium", "INC1008688"),
    ("RCA-09", "PTM", "Hard pegging issue in planning (Test and Production)",
     "Correct pegging setup/data",
     "Hard pegging configuration/data inconsistency in ASCP/MRP",
     "EBS ASCP/MRP", "Pegging setup",
     "Correct and standardise pegging setup; add a planning data-quality check",
     "Config", "Medium", "INC0933232"),
    ("RCA-10", "QTD", "Cannot change plant/warehouse on order",
     "Provide config workaround to change the plant",
     "Org/plant change validation blocks the change under certain order states",
     "EBS ONT/INV", "Ship-from org change validation",
     "Clarify and fix the plant-change validation so valid changes are not blocked",
     "Config", "Low", "INC0932356"),
    ("RCA-11", "QTD", "Sales order headers need reopening for audit changes",
     "Reopen SO headers as requested",
     "No self-service controlled path to reopen closed SO headers for audit corrections",
     "EBS ONT", "OE_ORDER_HEADERS_ALL flow status",
     "Provide a controlled, audited reopen process to remove repeated manual requests",
     "Process", "Low", "INC0909168"),
    ("RCA-12", "QTD", "DropShip order data corruption after cancellation",
     "Apply data fix to unlink/clean up the PO",
     "DropShip cancellation flow does not unlink the PO, leaving corrupt referential links",
     "CLOUD2EBS_DROPSHIP + EBS", "Drop shipment PO linkage",
     "Fix the DropShip cancellation to unlink the PO automatically and add a referential-integrity check",
     "Code", "Medium", "INC0899823;INC0899829"),
    ("RCA-13", "PTC", "Obligation error blocks revenue recognition / billing",
     "Functional configuration correction",
     "Revenue obligation / contingency setup incomplete for the project billing scenario",
     "EBS Projects/AR", "Revenue obligations setup",
     "Complete obligation and contingency setup; add a pre-billing validation",
     "Config", "Medium", "INC0899936"),
    ("RCA-14", "Services", "Order-to-contract generation anomaly",
     "Raise Oracle SR, track via SCTASK",
     "Order-to-contract cardinality not behaving as expected; suspected product defect",
     "EBS Service Contracts", "Contract auto-generation",
     "Confirm intended cardinality with Oracle; apply the patch/config once the SR resolves",
     "Vendor/Config", "High", "INC0897635;INC0899325"),
    ("RCA-AR1", "PTC", "AR AutoInvoice rejections (no revenue account, tax, period)",
     "Correct the line or AutoAccounting and re-run AutoInvoice (RAXMTR)",
     "AutoAccounting and tax setup have gaps for new batch sources and product lines, so AutoInvoice cannot derive the revenue CCID or tax",
     "EBS AR", "RA_INTERFACE_LINES_ALL / RA_INTERFACE_ERRORS_ALL / AutoAccounting",
     "Complete AutoAccounting and tax setup for all batch sources, and add a pre-AutoInvoice validation report that catches missing accounts before the run",
     "Config", "Medium", "AR interface incidents"),
    ("RCA-AP1", "PTP", "AP invoice import fails PO matching (qty/no match)",
     "Reconcile receipt/PO and resubmit Payables Open Interface Import",
     "Goods receipt not completed or PO line mismatch, so the invoice cannot 3-way match within tolerance",
     "EBS AP/PO", "AP_INVOICES_INTERFACE / AP_INTERFACE_REJECTIONS / RCV matching",
     "Enforce receipt-required and matching tolerances at supplier and PO setup, and alert on stuck interface rejections",
     "Config/Process", "Medium", "AP interface incidents"),
    ("RCA-AP2", "PTP", "AP invoice on price hold (invoice price over PO tolerance)",
     "Review price difference, release hold after approval or correct PO price",
     "Invoice unit price exceeds the PO price within tolerance because PO price agreements are not kept current",
     "EBS AP/PO", "AP_HOLDS_ALL / PO price agreement",
     "Keep PO price agreements current and tighten price tolerance governance to stop recurring price holds",
     "Config/Process", "Medium", "AP price-hold incidents"),
    ("RCA-AP3", "PTP", "AP invoice rejected on validation (supplier site / tax / account)",
     "Complete supplier site, tax registration or account setup and revalidate",
     "Supplier site, tax registration or distribution account setup is incomplete at onboarding",
     "EBS AP", "AP supplier site / tax setup",
     "Make supplier onboarding enforce tax registration and default accounting so invoices validate first time",
     "Config/Process", "Low", "AP validation incidents"),
]
write_csv("root_cause_analysis.csv",
          ["RCA_ID", "VALUE_STREAM", "SYMPTOM", "IMMEDIATE_RESOLUTION", "ROOT_CAUSE",
           "SOURCE_SYSTEM", "SOURCE_OBJECT", "PERMANENT_FIX", "FIX_CATEGORY",
           "EFFORT", "RELATED_INCIDENTS"], RCAS)


# ===========================================================================
# issue_patterns.csv  (classification of repetitive issues, with frequency)
# ===========================================================================
def inc_count(pattern_id):
    return sum(1 for r in incident_rows if r[10] == pattern_id)


PATTERNS = [
    ("PAT-REV-SYNC", "Item-MDM", "PD revision not interfaced to EBS (00 vs A)", "Yes (replay)", "RCA-01"),
    ("PAT-CCO", "Item-MDM", "CCO created with no/incorrect revised items", "No (assisted)", "RCA-02"),
    ("PAT-CCB-REV", "Item-MDM", "CCB report revision-sequence error", "No (guidance)", "RCA-03"),
    ("PAT-HOLD", "QTD", "Order lines stuck on auto-applied holds", "Yes (rule-based)", "RCA-04"),
    ("PAT-RCV", "PTM", "Receiving stuck in RCV_INTERFACE", "Yes (catalogued data fix)", "RCA-05"),
    ("PAT-BLUJAY", "PTM", "EBS to BluJay transmission failure", "Yes (replay)", "RCA-06"),
    ("PAT-CPQ", "QTD", "CPQ to EBS submission failure", "Partial", "RCA-07"),
    ("PAT-APPTREE", "PTM", "APPTREE_EVENT daily processing error", "No (code fix)", "RCA-08"),
    ("PAT-PEG", "PTM", "Hard pegging planning issue", "No (assisted)", "RCA-09"),
    ("PAT-PLANT", "QTD", "Plant/warehouse change blocked", "Partial", "RCA-10"),
    ("PAT-SOREOPEN", "QTD", "SO header reopen for audit", "Yes (controlled action)", "RCA-11"),
    ("PAT-DROPSHIP", "QTD", "DropShip PO-not-unlinked data corruption", "Yes (catalogued data fix)", "RCA-12"),
    ("PAT-OBLIG", "PTC", "Revenue obligation blocking recognition", "No (finance-approved)", "RCA-13"),
    ("PAT-CONTRACT", "Services", "Order-to-contract anomaly", "No (vendor SR)", "RCA-14"),
    ("PAT-AR-AUTOINV", "PTC", "AR AutoInvoice interface rejection", "Partial", "RCA-AR1"),
    ("PAT-AP-IMPORT", "PTP", "AP invoice import / matching failure", "No (assisted)", "RCA-AP1"),
    ("PAT-AP-HOLD", "PTP", "AP invoice on price/matching hold", "Partial", "RCA-AP2"),
]
rows = []
for pid, vs, sig, auto, rca in PATTERNS:
    rows.append([pid, vs, sig, inc_count(pid), auto, rca])
write_csv("issue_patterns.csv",
          ["PATTERN_ID", "VALUE_STREAM", "FAILURE_SIGNATURE", "OCCURRENCE_COUNT",
           "AUTO_RESOLVABLE", "ROOT_CAUSE_ID"], rows)


# ===========================================================================
# data_fix_catalogue.csv  (curated, change-gated; includes real-style SBM fix)
# ===========================================================================
DATA_FIXES = [
    ("SBM-090351", "Clear stuck RCV_INTERFACE rows and reprocess", "INV/PO",
     "Receipt stuck in RCV_INTERFACE, received qty 0", "RCV_INTERFACE,RCV_TRANSACTIONS_INTERFACE",
     "PROCESSING_STATUS_CODE,TRANSACTION_STATUS_CODE", 1, "Y", "Re-run Receiving Transaction Processor"),
    ("DFX-DROPSHIP-01", "Unlink PO after DropShip cancellation", "ONT/PO",
     "Cancelled DropShip order with PO still linked", "OE_DROP_SHIP_SOURCES,PO_HEADERS_ALL",
     "LINE_LOCATION_ID,PO_HEADER_ID", 2, "Y", "Restore link from oe_drop_ship_sources_bkp"),
    ("DFX-REVSYNC-01", "Force EBS revision to match PD after failed CO interface", "INV/BOM",
     "EBS revision 00 while PD revision A and CO not interfaced", "MTL_ITEM_REVISIONS_B",
     "REVISION", 1, "Y", "Revert revision from mtl_item_revisions_bkp, re-run CO interface"),
    ("DFX-HOLD-01", "Bulk release config-exception holds (condition cleared)", "ONT",
     "Autocreate Config Exception holds open after config validated", "OE_ORDER_HOLDS_ALL,OE_HOLD_SOURCES_ALL",
     "RELEASED_FLAG", 8, "Y", "Reset released_flag from audit snapshot"),
    ("DFX-OBLIG-01", "Republish stuck revenue obligation", "Projects/AR",
     "Obligation publishing error blocking rev rec", "PJB_BILL_TRX,RA_INTERFACE_LINES_ALL",
     "OBLIGATION_STATUS", 3, "Y", "Reverse and republish obligation"),
]
write_csv("data_fix_catalogue.csv",
          ["FIX_ID", "FIX_NAME", "EBS_MODULE", "SIGNATURE", "AFFECTED_TABLES",
           "AFFECTED_COLUMNS", "BLAST_RADIUS_ROWS", "REQUIRES_CHANGE_APPROVAL",
           "ROLLBACK_METHOD"], DATA_FIXES)


# ===========================================================================
# action_catalogue.csv  (approved write actions / EBS programs and interfaces)
# ===========================================================================
ACTIONS = [
    ("ACT-01", "Replay Change Order Interface", "ITEM_MDM", "CO/NRCO interface program",
     "Re-run the PD-to-EBS change-order interface for a failed CO", "Low", "PROD,UAT,DEV", "N", "Y", "PAT-REV-SYNC"),
    ("ACT-02", "Apply Revision Data Fix", "INV", "DFX-REVSYNC-01",
     "Align EBS revision to PD after a failed CO interface", "Medium", "PROD,UAT,DEV", "Y", "Y", "PAT-REV-SYNC"),
    ("ACT-03", "Release Order Hold", "ONT", "OE_Holds_PUB.Release_Holds",
     "Release a rule-matched config-exception hold once cleared", "Low", "PROD,UAT,DEV", "N", "Y", "PAT-HOLD"),
    ("ACT-04", "Clear RCV_INTERFACE and reprocess", "INV/PO", "SBM-090351 + Receiving Transaction Processor",
     "Clear stuck receiving rows and reprocess", "Medium", "PROD,UAT,DEV", "Y", "Y", "PAT-RCV"),
    ("ACT-05", "Replay BluJay Transmission", "WSH", "EBS-BluJay interface replay",
     "Replay a failed EBS-to-BluJay delivery transmission", "Low", "PROD,UAT,DEV", "N", "Y", "PAT-BLUJAY"),
    ("ACT-06", "Unlink DropShip PO", "ONT/PO", "DFX-DROPSHIP-01",
     "Unlink the PO left after a DropShip cancellation", "Medium", "PROD,UAT,DEV", "Y", "Y", "PAT-DROPSHIP"),
    ("ACT-07", "Resubmit CPQ Order", "ONT", "Order Import (OEOIMP)",
     "Resubmit a CPQ-sourced order after a config fix", "Low", "PROD,UAT,DEV", "N", "Y", "PAT-CPQ"),
    ("ACT-08", "Republish Revenue Obligation", "PTC", "DFX-OBLIG-01",
     "Republish a stuck obligation after finance approval", "Medium", "PROD,UAT,DEV", "Y", "N", "PAT-OBLIG"),
    ("ACT-09", "Controlled SO Reopen", "ONT", "OE header reopen (audited)",
     "Reopen a closed SO header for audit changes", "Medium", "PROD,UAT,DEV", "Y", "Y", "PAT-SOREOPEN"),
    ("ACT-10", "Re-run AutoInvoice", "AR", "RAXMTR (AutoInvoice Master Program)",
     "Resubmit AutoInvoice after correcting the rejected line or AutoAccounting", "Medium", "PROD,UAT,DEV", "Y", "N", "PAT-AR-AUTOINV"),
    ("ACT-11", "Resubmit Payables Open Interface", "AP", "APXIIMPT (Payables Open Interface Import)",
     "Re-import an AP invoice after the PO/receipt or setup is corrected", "Medium", "PROD,UAT,DEV", "Y", "N", "PAT-AP-IMPORT"),
    ("ACT-12", "Release AP Invoice Hold", "AP", "AP_HOLDS release (after approval)",
     "Release a price/matching hold once the price difference is approved", "Medium", "PROD,UAT,DEV", "Y", "Y", "PAT-AP-HOLD"),
]
write_csv("action_catalogue.csv",
          ["ACTION_ID", "ACTION_NAME", "EBS_MODULE", "EBS_PROGRAM_OR_API",
           "DESCRIPTION", "RISK_LEVEL", "ENVIRONMENT_ALLOWED", "REQUIRES_APPROVAL",
           "REVERSIBLE", "PATTERN_ID"], ACTIONS)


# ===========================================================================
# knowledge_base.csv  (runbooks distilled from the real close notes)
# ===========================================================================
KB = [
    ("KB-01", "Item-MDM", "Revision stuck at 00 after CO not interfaced",
     "Confirm CO/NRCO interface status. If NOT_INTERFACED, replay the interface; if Item Workbench was used afterwards, apply DFX-REVSYNC-01 then re-run the CO interface.", "PAT-REV-SYNC"),
    ("KB-02", "Item-MDM", "CCB report revision-sequence error",
     "New revision must be equal or higher than the old revision. Reject the CO, move to pending, set a greater revision, re-push to submitted and CCB.", "PAT-CCB-REV"),
    ("KB-03", "Item-MDM", "CCO created with no revised items",
     "Verify the CO number and that revised items exist under it. Recreate the CCO from the correct CO; check the CCB report for API revision errors.", "PAT-CCO"),
    ("KB-04", "QTD", "Order lines cannot progress (holds)",
     "List active holds via OE_ORDER_HOLDS_ALL. Release config-exception holds once configuration validates and PR/PO conditions clear (ACT-03).", "PAT-HOLD"),
    ("KB-05", "PTM", "Receiving stuck, quantity 0",
     "Records stuck in RCV_INTERFACE. Apply the catalogued clear-and-reprocess fix (SBM-090351) and re-run the Receiving Transaction Processor.", "PAT-RCV"),
    ("KB-06", "QTD", "DropShip data corruption after cancellation",
     "Root cause is the PO not unlinked after DropShip cancellation. Apply DFX-DROPSHIP-01 and verify referential integrity.", "PAT-DROPSHIP"),
    ("KB-07", "PTM", "EBS deliveries not reaching BluJay",
     "Check the EBS-BluJay transmission status. Replay failed messages (ACT-05); escalate if mapping/endpoint config is wrong.", "PAT-BLUJAY"),
    ("KB-08", "PTC", "Obligation error blocks revenue recognition",
     "Check obligation publishing and contingencies. Correct functional setup; republish via DFX-OBLIG-01 with finance approval.", "PAT-OBLIG"),
    ("KB-09", "PTC", "AR AutoInvoice rejection (no revenue account / tax / period)",
     "Read RA_INTERFACE_ERRORS_ALL. Fix AutoAccounting or the line, open the GL period if needed, then re-run AutoInvoice (RAXMTR). Prioritise high-value invoices and strategic customers.", "PAT-AR-AUTOINV"),
    ("KB-10", "PTP", "AP invoice import / matching failure",
     "Check AP_INTERFACE_REJECTIONS. Confirm the goods receipt and PO match within tolerance, correct, then resubmit Payables Open Interface Import. Flag critical and single-source suppliers.", "PAT-AP-IMPORT"),
    ("KB-11", "PTP", "AP invoice on price hold",
     "Compare invoice unit price to the PO price agreement. Correct the PO price or get the price difference approved, then release the hold.", "PAT-AP-HOLD"),
]
write_csv("knowledge_base.csv",
          ["KB_ID", "VALUE_STREAM", "TITLE", "RESOLUTION_SUMMARY", "PATTERN_ID"], KB)


# ===========================================================================
# users.csv  (Alice support personas + EBS responsibilities)
# ===========================================================================
USERS = [
    ("BUSER_OM", "Dana Okafor", "dana.okafor@vertiv.com", "Business User", "-", "Order Management User", "-"),
    ("BUSER_PD", "Marco Ferraro", "marco.ferraro@vertiv.com", "Business User", "-", "Engineering User", "-"),
    ("L1_ITEMMDM", "Priya Nair", "priya.nair@capgemini.com", "L1 Support Analyst", "L1", "Application Diagnostics", "Oracle-Alice-Item-MDM"),
    ("L1_QTD", "Tom Reyes", "tom.reyes@capgemini.com", "L1 Support Analyst", "L1", "Application Diagnostics", "OMCS-ERP-Alice-QTD"),
    ("L2_ITEMMDM", "Meet Meghani", "meet.meghani@capgemini.com", "L2 Support Engineer", "L2", "Bills of Material", "Oracle-Alice-Item-MDM"),
    ("L2_QTD", "Vikram Raju", "vikram.raju@capgemini.com", "L2 Support Engineer", "L2", "Order Management Super User", "OMCS-ERP-Alice-QTD"),
    ("L2_PTM", "Wei Zhang", "wei.zhang@capgemini.com", "L2 Support Engineer", "L2", "Purchasing Super User", "Oracle-EBS-Alice-OSA-PTM"),
    ("L3_TECH", "Anil Kapoor", "anil.kapoor@capgemini.com", "L3 SME", "L3", "System Administrator", "EBS-DBA"),
    ("L3_PTC", "Ravi Menon", "ravi.menon@capgemini.com", "L3 SME", "L3", "Projects Super User", "Oracle-EBS-Alice-PTC"),
    ("FIN_CTRL", "Helen Brandt", "helen.brandt@vertiv.com", "Finance Controller", "Approver", "Receivables Manager", "Oracle-EBS-Alice-PTC"),
    ("CHG_APPROVER", "Soumya Iyer", "soumya.iyer@capgemini.com", "Change Approver", "CAB", "System Administrator", "Change-Management"),
    ("AMS_MGR", "Claudia Rossi", "claudia.rossi@capgemini.com", "AMS Service Manager", "Manager", "Application Diagnostics", "AMS-Leadership"),
    ("PLAT_ADMIN", "Hiroshi Tanaka", "hiroshi.tanaka@capgemini.com", "Platform Admin", "Admin", "System Administrator", "AMS-Platform"),
]
write_csv("users.csv",
          ["USER_NAME", "FULL_NAME", "EMAIL", "APP_ROLE", "AMS_TIER",
           "EBS_RESPONSIBILITY", "ASSIGNMENT_GROUP"], USERS)


# ===========================================================================
# Knowledge graph: kg_nodes.csv + kg_edges.csv
#   Incident -> Pattern -> RootCause -> PermanentFix -> SourceSystem
#   Incident -> Item, Incident -> LinkedIncident (recurrence), ValueStream/System
# ===========================================================================
nodes, edges, seen = [], [], set()


def node(nid, ntype, label, attrs=""):
    if nid and nid not in seen:
        seen.add(nid)
        nodes.append([nid, ntype, label, attrs])


def edge(s, et, t, attrs=""):
    if s and t:
        edges.append([s, et, t, attrs])


for s in SYSTEMS:
    node(s, "System", s)
VS_SYSTEMS = {
    "Item-MDM": ["AGILE_PD", "ITEM_MDM", "EBS"], "QTD": ["CPQ", "EBS", "CLOUD2EBS_DROPSHIP"],
    "PTM": ["EBS", "BLUJAY"], "PTC": ["EBS"], "Services": ["EBS"],
}
for vs, syss in VS_SYSTEMS.items():
    node(vs, "ValueStream", vs)
    for s in syss:
        edge(vs, "SPANS_SYSTEM", s)
for r in RCAS:
    node(r[0], "RootCause", r[2], r[8])
    pf = r[0].replace("RCA", "PFIX")
    node(pf, "PermanentFix", r[7], r[8])
    edge(r[0], "RESOLVED_AT_SOURCE_BY", pf)
    edge(pf, "TARGETS_SOURCE", r[5].split(" + ")[0].strip())
for pid, vs, sig, auto, rca in PATTERNS:
    node(pid, "IssuePattern", sig, auto)
    edge(pid, "HAS_ROOT_CAUSE", rca)
    edge(pid, "IN_VALUE_STREAM", vs)
for fx in DATA_FIXES:
    node(fx[0], "DataFix", fx[1])
for seg1, desc, cat in ITEMS:
    node(seg1, "Item", desc, cat)
for r in incident_rows:
    num, sd, group, pat, rca, linked, recur, vs, sysm = r[1], r[2], r[3], r[10], r[11], r[13], r[14], r[8], r[9]
    node(num, "Incident", sd[:60], r[0])
    edge(num, "IN_VALUE_STREAM", vs)
    edge(num, "MATCHES_PATTERN", pat)
    edge(num, "CAUSED_BY", rca)
    if linked:
        node(linked, "Incident", "linked/recreated ticket", "recurrence")
        edge(num, "RECURRENCE_OF", linked)
write_csv("kg_nodes.csv", ["NODE_ID", "NODE_TYPE", "LABEL", "ATTRIBUTES"], nodes)
write_csv("kg_edges.csv", ["SOURCE_NODE", "EDGE_TYPE", "TARGET_NODE", "ATTRIBUTES"], edges)


# ===========================================================================
# agent_worklog.csv  (header only; the agent appends at runtime)
# ===========================================================================
write_csv("agent_worklog.csv",
          ["LOG_ID", "TIMESTAMP", "INCIDENT_NUMBER", "VALUE_STREAM", "AGENT_STAGE",
           "DECISION", "ACTION_TAKEN", "RESOLUTION_TIER", "APPROVER_ROLE",
           "TARGET_SYSTEM", "EVIDENCE_REF", "NOTE"], [])

print("\nAll synthetic EBS demo data (real-aligned) written to:", BASE)
