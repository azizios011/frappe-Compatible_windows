# Helpers for the Axeane Settings custom module (frappe/custom_modules/).

import frappe


def clear_module_map_cache():
	"""`frappe.local.app_modules` (the list of modules a migrate will sync) is loaded from a
	Redis-cached `app_modules` key at `frappe.init()` time -- *before* migrate's own
	`frappe.clear_cache()` runs. That means a migrate which adds a brand-new
	custom_modules/<folder> can silently run against a stale cached module list and skip
	syncing that folder's doctypes/workspaces/pages entirely, with no error surfaced.
	Clearing the cache key here (at the end of install/migrate) guarantees the *next*
	migrate run starts with a fresh disk scan, so a newly added custom module is picked up
	after one extra `bench migrate` instead of requiring a full site reinstall."""
	frappe.cache.delete_value("app_modules")
	frappe.cache.delete_value("installed_app_modules")


def after_migrate():
	clear_module_map_cache()
