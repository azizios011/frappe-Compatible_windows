# Copyright (c) 2026, Frappe Technologies and contributors
# For license information, please see license.txt

"""Whitelisted helpers for the Template Prompt system (Axeane Settings).

Every function is System Manager only and fully type-annotated. No prompt
text lives in the code: prompts are user content on the Template Prompt
records, and the contract reference is generated from the validators' own
registries (erpnext app, loaded lazily)."""

import re
import unicodedata

import frappe
from frappe import _


def prompt_filename(document_type: str) -> str:
	"""FACTURE_ACHAT.md / RS_ACHAT.md: uppercased, spaces become underscores,
	accents stripped, only A-Z 0-9 _ kept."""
	stripped = unicodedata.normalize("NFD", document_type or "")
	stripped = "".join(char for char in stripped if not unicodedata.combining(char))
	stripped = stripped.upper().replace(" ", "_")
	return re.sub(r"[^A-Z0-9_]", "", stripped) + ".md"


def _load_validator(document_type: str):
	"""The per-doctype validators live in the erpnext app; load lazily so a
	frappe-only site still boots."""
	try:
		from erpnext.custom_modules.facturation.template_validators.registry import get_validator
	except ImportError as error:
		frappe.throw(
			_("The template validators package is not available (erpnext app): {0}").format(error)
		)
	validator = get_validator(document_type)
	if not validator:
		frappe.throw(_("No validator for {0} yet.").format(document_type))
	return validator


@frappe.whitelist()
def get_template_prompt(document_type: str) -> dict:
	"""The enabled Template Prompt of a Facturation doctype:
	{"filename": "FACTURE_ACHAT.md", "content": "..."} or a clear error."""
	frappe.only_for("System Manager")
	if not document_type:
		frappe.throw(_("document_type is required."))
	row = frappe.db.get_value(
		"Template Prompt",
		{"document_type": document_type, "enabled": 1},
		["name", "prompt"],
		as_dict=True,
	)
	if not row:
		frappe.throw(
			_("No enabled Template Prompt for {0}. Create it in Axeane Settings.").format(
				_(document_type)
			)
		)
	return {"filename": prompt_filename(document_type), "content": row.prompt or ""}


@frappe.whitelist()
def get_contract_reference(document_type: str) -> str:
	"""Markdown facts generated from the validator's own registry: canonical
	fields, allowed types, filters, forbidden constructs. Never instructions."""
	frappe.only_for("System Manager")
	if not document_type:
		frappe.throw(_("document_type is required."))
	return _load_validator(document_type).describe_contract()
