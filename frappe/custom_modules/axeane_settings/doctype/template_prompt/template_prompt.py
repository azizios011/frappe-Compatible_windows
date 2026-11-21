# Copyright (c) 2026, Frappe Technologies and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class TemplatePrompt(Document):
	def validate(self) -> None:
		# the link query is already restricted to the Facturation module;
		# enforce it server side too
		module = frappe.db.get_value("DocType", self.document_type, "module")
		if module != "Facturation":
			frappe.throw(_("Template Prompt applies to Facturation doctypes only."))
