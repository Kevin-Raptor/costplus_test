import os
import re
import json
import shutil
import hashlib
from pathlib import Path
from collections import defaultdict

import openpyxl
from rapidfuzz import fuzz

# from PIL import Image
# import imagehash

from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    SimpleDocTemplate,
    Image as PDFImage,
    Paragraph,
    Spacer,
    PageBreak,
)
from reportlab.lib.styles import getSampleStyleSheet

# ============================================================
# CONFIG
# ============================================================

MASTER_FILE = Path("master_list.xlsx")
SCANS_DIR = Path("scans")
PHOTOS_DIR = Path("photo_files")

OUTPUT_DIR = Path("output")
QUARANTINE_DIR = OUTPUT_DIR / "quarantine"
PDF_DIR = OUTPUT_DIR / "pdfs"

MATCHES_FILE = OUTPUT_DIR / "matches.json"
DUPLICATES_FILE = OUTPUT_DIR / "duplicates.json"
RECONCILIATION_FILE = OUTPUT_DIR / "reconciliation.json"

# PHASH_DUPLICATE_THRESHOLD = 5
# PHASH_REVIEW_THRESHOLD = 10

# Adjust these if the actual column names differ.
MASTER_COLUMNS = {
    "name": "NAME",
    "address": "FULL ADDRESS",
    "shs_serial": "SHS KIT S.N.",
    "panel_serial": "SOLAR PANEL",
    "ias_no": "IAS NO",
    "ir_no": "IR REPORT NO.",
}


# ============================================================
# HELPERS
# ============================================================


def normalize(value):
    """
    Normalize strings so that differences such as:

        Labastida, Jocelyn R.
        LABASTIDA JOCELYN R
        labastida_jocelyn_r

    become comparable.
    """
    if value is None:
        return ""

    value = str(value).lower().strip()

    # Replace common separators with spaces
    value = value.replace("_", " ")
    value = value.replace("-", " ")

    # Remove punctuation
    value = re.sub(r"[^a-z0-9\s]", " ", value)

    # Collapse whitespace
    value = re.sub(r"\s+", " ", value)

    return value.strip()


def compact(value):
    """
    More aggressive normalization.

    Useful for identifiers such as:
        25-0912
        25_0912
        250912
    """
    return re.sub(r"[^a-z0-9]", "", normalize(value))


def sha256_file(path):
    hash_obj = hashlib.sha256()

    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            hash_obj.update(chunk)

    return hash_obj.hexdigest()


# def phash_file(path):
#     try:
#         with Image.open(path) as img:
#             return imagehash.phash(img)
#     except Exception:
#         return None


def ensure_dirs():
    OUTPUT_DIR.mkdir(exist_ok=True)
    QUARANTINE_DIR.mkdir(exist_ok=True)
    PDF_DIR.mkdir(exist_ok=True)


def quarantine_file(path, reason, category="unknown"):
    """
    Copy the problematic input into a quarantine folder.
    Keep the original untouched.
    """
    target_dir = QUARANTINE_DIR / category
    target_dir.mkdir(parents=True, exist_ok=True)

    destination = target_dir / path.name

    # Avoid overwriting another quarantined file
    counter = 1

    while destination.exists():
        destination = target_dir / f"{path.stem}_{counter}{path.suffix}"
        counter += 1

    if path.is_dir():
        shutil.copytree(path, destination, dirs_exist_ok=True)
    else:
        shutil.copy2(path, destination)

    return {
        "original": str(path),
        "quarantine_path": str(destination),
        "reason": reason,
    }


# ============================================================
# MASTER LIST
# ============================================================


def load_master_list():
    workbook = openpyxl.load_workbook(MASTER_FILE, data_only=True)
    sheet = workbook.active

    headers = [cell.value for cell in sheet[1]]

    header_index = {str(header).strip(): index for index, header in enumerate(headers)}

    units = []

    for row_number, row in enumerate(sheet.iter_rows(min_row=2), start=2):

        def get(column):
            column_name = MASTER_COLUMNS[column]

            if column_name not in header_index:
                raise ValueError(f"Column '{column_name}' not found in master list")

            return row[header_index[column_name]].value

        unit = {
            "row": row_number,
            "name": str(get("name") or "").strip(),
            "address": str(get("address") or "").strip(),
            "shs_serial": str(get("shs_serial") or "").strip(),
            "panel_serial": str(get("panel_serial") or "").strip(),
            "ias_no": str(get("ias_no") or "").strip(),
            "ir_no": str(get("ir_no") or "").strip(),
        }

        unit["normalized_name"] = normalize(unit["name"])

        units.append(unit)

    return units


# ============================================================
# MATCHING
# ============================================================


def extract_filename_text(path):
    """
    Everything useful from the filename.

    Example:
        25_0912-LABASTIDA.jpg

    becomes:
        25_0912 LABASTIDA
    """
    return path.stem


def exact_identifier_match(filename, unit):
    """
    Try strong identifiers first.
    """

    filename_compact = compact(filename)

    identifiers = [
        ("ias_exact", unit["ias_no"]),
        ("shs_serial_exact", unit["shs_serial"]),
        ("panel_serial_exact", unit["panel_serial"]),
        ("ir_report_exact", unit["ir_no"]),
    ]

    for method, identifier in identifiers:

        if not identifier:
            continue

        identifier_compact = compact(identifier)

        if identifier_compact and identifier_compact in filename_compact:
            return method, 100

    return None


def normalized_name_match(filename, unit):
    filename_normalized = normalize(filename)

    if not filename_normalized:
        return False

    name = unit["normalized_name"]

    if not name:
        return False

    # Direct normalized name containment
    if name in filename_normalized:
        return True

    return False


def fuzzy_name_score(filename, unit):
    filename_normalized = normalize(filename)
    name = unit["normalized_name"]

    if not filename_normalized or not name:
        return 0

    return fuzz.token_set_ratio(
        filename_normalized,
        name,
    )


def match_input(path, units):
    """
    Conservative matching hierarchy:

    1. IAS
    2. SHS serial
    3. Panel serial
    4. IR report number
    5. normalized name
    6. fuzzy name
    7. quarantine
    """

    filename = extract_filename_text(path)

    # --------------------------------------------------------
    # Strong identifier matching
    # --------------------------------------------------------

    strong_matches = []

    for unit in units:
        result = exact_identifier_match(filename, unit)

        if result:
            method, score = result

            strong_matches.append(
                {
                    "unit": unit,
                    "method": method,
                    "score": score,
                }
            )

    # If exactly one strong match exists, accept it.
    if len(strong_matches) == 1:

        match = strong_matches[0]

        return {
            "status": "matched",
            "unit": match["unit"],
            "method": match["method"],
            "score": match["score"],
        }

    # Multiple strong matches = ambiguous
    if len(strong_matches) > 1:
        return {
            "status": "ambiguous",
            "reason": "multiple_strong_identifier_matches",
            "candidates": [
                {
                    "ias_no": m["unit"]["ias_no"],
                    "name": m["unit"]["name"],
                    "method": m["method"],
                }
                for m in strong_matches
            ],
        }

    # --------------------------------------------------------
    # Normalized name
    # --------------------------------------------------------

    name_matches = []

    for unit in units:
        if normalized_name_match(filename, unit):
            name_matches.append(unit)

    if len(name_matches) == 1:
        return {
            "status": "matched",
            "unit": name_matches[0],
            "method": "normalized_name",
            "score": 100,
        }

    if len(name_matches) > 1:
        return {
            "status": "ambiguous",
            "reason": "multiple_normalized_name_matches",
            "candidates": [
                {
                    "ias_no": u["ias_no"],
                    "name": u["name"],
                }
                for u in name_matches
            ],
        }

    # --------------------------------------------------------
    # Fuzzy name matching
    # --------------------------------------------------------

    candidates = []

    for unit in units:
        score = fuzzy_name_score(filename, unit)

        if score >= 80:
            candidates.append(
                {
                    "unit": unit,
                    "score": score,
                }
            )

    candidates.sort(
        key=lambda x: x["score"],
        reverse=True,
    )

    if candidates:

        best = candidates[0]

        second_score = candidates[1]["score"] if len(candidates) > 1 else 0

        # Conservative acceptance:
        #
        # High enough score AND clearly better than second candidate.
        if best["score"] >= 90 and best["score"] - second_score >= 5:
            return {
                "status": "matched",
                "unit": best["unit"],
                "method": "fuzzy_name",
                "score": best["score"],
            }

        return {
            "status": "ambiguous",
            "reason": "fuzzy_match_not_confident",
            "candidates": [
                {
                    "ias_no": c["unit"]["ias_no"],
                    "name": c["unit"]["name"],
                    "score": c["score"],
                }
                for c in candidates[:5]
            ],
        }

    return {
        "status": "unmatched",
        "reason": "no_match_found",
    }


# ============================================================
# TASK 1 + 2
# MATCH SCANS
# ============================================================


def match_scans(units):
    results = []
    matched_units = set()

    scan_files = [p for p in SCANS_DIR.iterdir() if p.is_file()]
    print(f"Found {len(scan_files)} scan files to process.")
    for scan in scan_files:

        result = match_input(scan, units)

        if result["status"] == "matched":

            unit = result["unit"]
            ias = unit["ias_no"]

            # One unit shouldn't silently receive multiple scans.
            if ias in matched_units:

                quarantine = quarantine_file(
                    scan,
                    "multiple_scans_for_same_unit",
                    "scans",
                )

                results.append(
                    {
                        "input": str(scan),
                        "status": "quarantined",
                        "reason": "multiple_scans_for_same_unit",
                        "quarantine": quarantine,
                    }
                )

                continue

            matched_units.add(ias)

            results.append(
                {
                    "input": str(scan),
                    "status": "matched",
                    "ias_no": ias,
                    "beneficiary": unit["name"],
                    "method": result["method"],
                    "score": result["score"],
                }
            )

        else:

            quarantine = quarantine_file(
                scan,
                result["reason"],
                "scans",
            )

            results.append(
                {
                    "input": str(scan),
                    "status": "quarantined",
                    "reason": result["reason"],
                    "quarantine": quarantine,
                    "candidates": result.get("candidates", []),
                }
            )

    return results


# ============================================================
# PHOTO FOLDERS
# ============================================================


def get_photo_files(folder):
    return [
        p
        for p in folder.iterdir()
        if p.is_file()
        and p.suffix.lower()
        in {
            ".jpg",
            ".jpeg",
            ".png",
            ".webp",
        }
    ]


def match_photo_folders(units):
    results = []

    folders = [p for p in PHOTOS_DIR.iterdir() if p.is_dir()]

    matched_units = {}

    for folder in folders:

        result = match_input(folder, units)

        if result["status"] != "matched":

            results.append(
                {
                    "folder": str(folder),
                    "status": "quarantined",
                    "reason": result["reason"],
                    "candidates": result.get("candidates", []),
                    "quarantine": quarantine_file(
                        folder,
                        result["reason"],
                        "photo_folders",
                    ),
                }
            )

            continue

        unit = result["unit"]
        ias = unit["ias_no"]

        if ias in matched_units:

            results.append(
                {
                    "folder": str(folder),
                    "status": "quarantined",
                    "reason": "multiple_photo_folders_for_same_unit",
                    "quarantine": quarantine_file(
                        folder,
                        "multiple_photo_folders_for_same_unit",
                        "photo_folders",
                    ),
                }
            )

            continue

        photos = get_photo_files(folder)

        # Requirement says five photos.
        if len(photos) != 5:

            results.append(
                {
                    "folder": str(folder),
                    "status": "incomplete",
                    "ias_no": ias,
                    "beneficiary": unit["name"],
                    "photo_count": len(photos),
                    "expected": 5,
                    "photos": [str(p) for p in photos],
                    "method": result["method"],
                    "score": result["score"],
                }
            )

            matched_units[ias] = folder
            continue

        matched_units[ias] = folder

        results.append(
            {
                "folder": str(folder),
                "status": "matched",
                "ias_no": ias,
                "beneficiary": unit["name"],
                "photo_count": len(photos),
                "photos": [str(p) for p in photos],
                "method": result["method"],
                "score": result["score"],
            }
        )

    return results


# ============================================================
# TASK 3
# DEDUPLICATION
# ============================================================


def calculate_photo_hashes(photo_results):
    """
    Calculate SHA-256 hashes for all available photos.

    SHA-256 detects exact file reuse:
    - Renaming a file does not change the hash.
    - Moving a file does not change the hash.
    - Copying the exact same file produces the same hash.
    - Recompressing/editing the image produces a different hash.
    """

    photos = []

    for result in photo_results:

        if result["status"] not in {
            "matched",
            "incomplete",
        }:
            continue

        for photo in result.get("photos", []):

            path = Path(photo)

            if not path.exists():
                continue

            photos.append(
                {
                    "path": str(path),
                    "ias_no": result["ias_no"],
                    "beneficiary": result["beneficiary"],
                    "sha256": sha256_file(path),
                }
            )

    return photos


def detect_duplicates(photo_hashes):
    """
    Detect exact duplicate photo files using SHA-256.

    Only files belonging to different IAS units are considered
    duplicate/reused photos.
    """

    hash_groups = defaultdict(list)

    # Group photos by SHA-256
    for item in photo_hashes:

        sha256 = item.get("sha256")

        if not sha256:
            continue

        hash_groups[sha256].append(item)

    duplicates = []

    # Compare files sharing the same SHA-256
    for sha256, items in hash_groups.items():

        if len(items) < 2:
            continue

        for i in range(len(items)):
            for j in range(i + 1, len(items)):

                a = items[i]
                b = items[j]

                # Same unit is not considered cross-beneficiary reuse
                if a["ias_no"] == b["ias_no"]:
                    continue

                duplicates.append(
                    {
                        "type": "exact",
                        "method": "sha256",
                        "distance": 0,
                        "sha256": sha256,
                        "unit_a": a["ias_no"],
                        "beneficiary_a": a["beneficiary"],
                        "photo_a": a["path"],
                        "unit_b": b["ias_no"],
                        "beneficiary_b": b["beneficiary"],
                        "photo_b": b["path"],
                    }
                )

    return duplicates


# ============================================================
# TASK 4
# PDF GENERATION
# ============================================================


def create_pdf(unit, scan_path, photo_result):
    """
    IAS scan first.
    Then five photos.
    Each photo gets a label.
    """

    output = PDF_DIR / f"IRR_{unit['ias_no']}.pdf"

    document = SimpleDocTemplate(
        str(output),
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    story = []

    # --------------------------------------------------------
    # IAS
    # --------------------------------------------------------

    story.append(
        Paragraph(
            f"<b>IAS</b> — {unit['name']} — IAS No: {unit['ias_no']}",
            styles["Heading2"],
        )
    )

    story.append(Spacer(1, 10))

    story.append(
        PDFImage(
            str(scan_path),
            width=500,
            height=700,
            kind="proportional",
        )
    )

    story.append(PageBreak())

    # --------------------------------------------------------
    # Photos
    # --------------------------------------------------------

    photos = photo_result.get("photos", [])

    for index, photo in enumerate(photos, start=1):

        photo_type = Path(photo).stem

        story.append(
            Paragraph(
                f"<b>Photo {index}</b> — "
                f"{photo_type} — "
                f"{unit['name']} — "
                f"IAS No: {unit['ias_no']}",
                styles["Heading2"],
            )
        )

        story.append(Spacer(1, 10))

        story.append(
            PDFImage(
                photo,
                width=500,
                height=650,
                kind="proportional",
            )
        )

        if index != len(photos):
            story.append(PageBreak())

    document.build(story)

    return output


# ============================================================
# TASK 5
# RECONCILIATION
# ============================================================


def reconcile(
    units,
    scan_results,
    photo_results,
    duplicate_results,
    generated_pdfs,
):
    master_ias = {unit["ias_no"] for unit in units}

    matched_scans = {r["ias_no"] for r in scan_results if r["status"] == "matched"}

    quarantined_scans = [r for r in scan_results if r["status"] == "quarantined"]

    matched_photo_folders = {
        r["ias_no"] for r in photo_results if r["status"] == "matched"
    }

    incomplete_photo_folders = [r for r in photo_results if r["status"] == "incomplete"]

    quarantined_photo_folders = [
        r for r in photo_results if r["status"] == "quarantined"
    ]

    missing_scans = sorted(master_ias - matched_scans)

    all_photo_units = matched_photo_folders | {
        r["ias_no"] for r in incomplete_photo_folders
    }

    missing_photo_folders = sorted(master_ias - all_photo_units)

    report = {
        "master_units": len(units),
        "scans": {
            "total_inputs": len(scan_results),
            "matched": len(matched_scans),
            "quarantined": len(quarantined_scans),
            "missing_for_master_units": len(missing_scans),
            "missing_ias_numbers": missing_scans,
        },
        "photo_folders": {
            "total_inputs": len(photo_results),
            "matched": len(matched_photo_folders),
            "incomplete": len(incomplete_photo_folders),
            "quarantined": len(quarantined_photo_folders),
            "missing_for_master_units": len(missing_photo_folders),
            "missing_ias_numbers": missing_photo_folders,
        },
        "duplicates": {
            "pairs_found": len(duplicate_results),
            "pairs": duplicate_results,
        },
        "pdfs": {
            "generated": len(generated_pdfs),
            "files": generated_pdfs,
        },
    }

    return report


# ============================================================
# MAIN PIPELINE
# ============================================================


def main():

    ensure_dirs()

    print("\n===================================")
    print("CPI IAS/IRR PROCESSING PIPELINE")
    print("===================================\n")

    # --------------------------------------------------------
    # LOAD MASTER
    # --------------------------------------------------------

    print("Loading master list...")

    units = load_master_list()

    print(f"Master units: {len(units)}")

    # --------------------------------------------------------
    # MATCH SCANS
    # --------------------------------------------------------

    print("\n[1/5] Matching scans...")

    scan_results = match_scans(units)

    matched_scans = [r for r in scan_results if r["status"] == "matched"]

    print(f"Matched scans: {len(matched_scans)}")

    # --------------------------------------------------------
    # MATCH PHOTO FOLDERS
    # --------------------------------------------------------

    print("\n[2/5] Matching photo folders...")

    photo_results = match_photo_folders(units)

    matched_photos = [r for r in photo_results if r["status"] == "matched"]

    print(f"Matched complete photo folders: " f"{len(matched_photos)}")

    # --------------------------------------------------------
    # DEDUPLICATION
    # --------------------------------------------------------

    print("\n[3/5] Detecting duplicate photos...")

    photo_hashes = calculate_photo_hashes(photo_results)
    print(f"Len of photo hashes: {len(photo_hashes)}")
    print(f"hash 1: {photo_hashes[0] if photo_hashes else 'N/A'}")

    duplicate_results = detect_duplicates(photo_hashes)

    print(f"Duplicate pairs found: " f"{len(duplicate_results)}")

    # --------------------------------------------------------
    # Determine units that are safe for PDF generation
    # --------------------------------------------------------

    duplicate_units = set()

    for duplicate in duplicate_results:
        duplicate_units.add(duplicate["unit_a"])
        duplicate_units.add(duplicate["unit_b"])

    scan_by_ias = {r["ias_no"]: r for r in scan_results if r["status"] == "matched"}

    photo_by_ias = {r["ias_no"]: r for r in photo_results if r["status"] == "matched"}

    # --------------------------------------------------------
    # PDF GENERATION
    # --------------------------------------------------------

    print("\n[4/5] Generating PDFs...")

    generated_pdfs = []

    for unit in units:

        ias = unit["ias_no"]

        scan_result = scan_by_ias.get(ias)
        photo_result = photo_by_ias.get(ias)

        # Need both
        if not scan_result or not photo_result:
            continue

        # Don't generate report if unit participates
        # in a duplicate photo pair.
        if ias in duplicate_units:
            continue

        scan_path = Path(scan_result["input"])

        pdf_path = create_pdf(
            unit,
            scan_path,
            photo_result,
        )

        generated_pdfs.append(str(pdf_path))

    print(f"PDFs generated: {len(generated_pdfs)}")

    # --------------------------------------------------------
    # RECONCILIATION
    # --------------------------------------------------------

    print("\n[5/5] Reconciling...")

    reconciliation = reconcile(
        units,
        scan_results,
        photo_results,
        duplicate_results,
        generated_pdfs,
    )

    # --------------------------------------------------------
    # WRITE OUTPUT
    # --------------------------------------------------------

    with open(
        MATCHES_FILE,
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            {
                "scans": scan_results,
                "photo_folders": photo_results,
            },
            f,
            indent=2,
        )

    with open(
        DUPLICATES_FILE,
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            duplicate_results,
            f,
            indent=2,
        )

    with open(
        RECONCILIATION_FILE,
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            reconciliation,
            f,
            indent=2,
        )

    # --------------------------------------------------------
    # CONSOLE SUMMARY
    # --------------------------------------------------------

    print("\n===================================")
    print("RECONCILIATION")
    print("===================================")

    print(f"Master units: " f"{reconciliation['master_units']}")

    print("\nSCANS")

    print(f"  Matched: " f"{reconciliation['scans']['matched']}")

    print(f"  Quarantined: " f"{reconciliation['scans']['quarantined']}")

    print(f"  Missing: " f"{reconciliation['scans']['missing_for_master_units']}")

    print("\nPHOTO FOLDERS")

    print(f"  Matched: " f"{reconciliation['photo_folders']['matched']}")

    print(f"  Incomplete: " f"{reconciliation['photo_folders']['incomplete']}")

    print(f"  Quarantined: " f"{reconciliation['photo_folders']['quarantined']}")

    print(
        f"  Missing: " f"{reconciliation['photo_folders']['missing_for_master_units']}"
    )

    print("\nDUPLICATES")

    print(f"  Duplicate pairs: " f"{reconciliation['duplicates']['pairs_found']}")

    print("\nPDFS")

    print(f"  Generated: " f"{reconciliation['pdfs']['generated']}")

    print("\nOutput written to:")
    print(f"  {OUTPUT_DIR.absolute()}")


if __name__ == "__main__":
    main()
