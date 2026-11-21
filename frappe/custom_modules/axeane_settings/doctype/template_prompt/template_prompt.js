// Template Prompt form: the "Insert contract reference" button appends the
// facts the validator's own registry produces (canonical fields, allowed
// types, filters, forbidden constructs) to the prompt editor, so the user
// builds the prompt on top of it. No prompt text ships in the code.
frappe.ui.form.on("Template Prompt", {
	refresh(frm) {
		frm.add_custom_button(__("Insert contract reference"), () => {
			if (!frm.doc.document_type) {
				frappe.msgprint({
					title: __("Template Prompt"),
					message: __("Select a Document Type first."),
					indicator: "orange",
				});
				return;
			}
			frappe.call({
				type: "GET",
				method: "frappe.custom_modules.axeane_settings.api.get_contract_reference",
				args: { document_type: frm.doc.document_type },
				callback(r) {
					const current = frm.doc.prompt || "";
					frm.set_value("prompt", current ? `${current}\n\n${r.message}` : r.message);
					frappe.show_alert({
						message: __("Contract reference inserted."),
						indicator: "green",
					});
				},
			});
		});
	},
});
