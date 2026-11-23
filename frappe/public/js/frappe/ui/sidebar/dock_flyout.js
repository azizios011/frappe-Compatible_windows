// The dock flyout: hovering a workspace tile in the dock rail shows that workspace's sidebar
// elements in a small card beside the rail, so the reader can jump straight to any item without
// opening the workspace first. It works only with the sidebar collapsed; while the sidebar is
// expanded, the flyout stays shut for every workspace tile so it never overlaps the sidebar's
// own items.
//
// frappe.ui.DockFlyout is owned by the Dock: one instance, one flyout at a time. The data is the
// same payload the real sidebar renders, `frappe.boot.module_sidebars[entry.module].items`, which
// the server has already filtered for permissions, hidden and disabled rows; the one visibility
// rule the sidebar applies on top — an item whose route does not resolve renders nothing — is
// reused through `frappe.ui.sidebar_item.get_route` rather than re-implemented here.
//
// A touch screen has no hover and a phone has no rail to fly from, so the whole feature is
// skipped there and the tiles keep their name tooltips.
frappe.ui.DockFlyout = class DockFlyout {
	// Hover a moment before the flyout commits, and a grace when the pointer crosses the gap
	// between the tile and the card, so the crossing never flickers.
	static OPEN_DELAY = 120;
	static CLOSE_DELAY = 150;
	static GAP = 6;
	static EDGE = 8;

	constructor(dock) {
		this.dock = dock;
		this.$flyout = null;
		this.$tile = null;
		this.entry = null;
		this.open_timer = null;
		this.close_timer = null;
		this.bind_once();
		this.hook_sidebar();
	}

	// A touch device or a phone cannot hover: no flyouts, tiles keep their tooltips.
	static available() {
		return !frappe.is_mobile() && frappe.ui.Dock.pointer_can_reveal();
	}

	// Wire a dock tile to the flyout. Returns the flyout when the entry carries items to show —
	// the dock then drops the tile's plain name tooltip, since the flyout header names the
	// workspace — and null when there is nothing to fly out (URL entries, utilities), which keeps
	// the tooltip.
	attach($tile, entry) {
		if (!frappe.ui.DockFlyout.available()) return null;
		const items = entry.module ? frappe.boot.module_sidebars[entry.module]?.items : null;
		if (!items || !items.length) return null;
		// At least one row must resolve a route, or the card would open empty and the tile
		// would have traded its tooltip for nothing.
		const any_visible = items.some(
			(item) => item.type === "Link" && frappe.ui.sidebar_item.get_route(item, false, entry.module)
		);
		if (!any_visible) return null;

		$tile.on("mouseenter.dock-flyout", () => this.request_open($tile, entry));
		$tile.on("mouseleave.dock-flyout", () => this.schedule_close());
		$tile.on("focus.dock-flyout", (e) => {
			// Keyboard only: a pointer focus has already opened it through hover, and
			// `:focus-visible` is what separates the keyboard from the click that just landed.
			const target = e.target;
			if (target.matches && target.matches(":focus-visible")) this.request_open($tile, entry, 0);
		});
		$tile.on("blur.dock-flyout", () => this.schedule_close());
		$tile.on("keydown.dock-flyout", (e) => {
			if (e.key === "ArrowDown" || e.key === "Tab") {
				e.preventDefault();
				e.stopPropagation();
				this.open_now($tile, entry);
				this.focus_first_row();
			} else if (e.key === "Escape" && this.is_open()) {
				// Esc closes the flyout and returns focus to the tile, not the dock's own Esc,
				// which would close the whole tray.
				e.stopPropagation();
				this.close(true);
			}
		});
		return this;
	}

	request_open($tile, entry, delay) {
		if (this.dock.dragged || this.dock.editor || document.body.classList.contains("dock-editing")) {
			return; // dragging a tile is a way into arranging, never a way into a flyout
		}
		if (this.dock.sidebar?.sidebar_expanded) {
			return;
		}
		// Instant when another flyout is already open: moving along the rail flips the card.
		this.request_open_impl($tile, entry, this.is_open() ? 0 : (delay ?? frappe.ui.DockFlyout.OPEN_DELAY));
	}

	request_open_impl($tile, entry, delay) {
		if (this.open_timer) clearTimeout(this.open_timer);
		this.open_timer = setTimeout(() => this.open($tile, entry), delay);
	}

	open_now($tile, entry) {
		if (this.open_timer) clearTimeout(this.open_timer);
		this.open($tile, entry);
	}

	is_open() {
		return !!this.$flyout;
	}

	open($tile, entry) {
		if (this.dock.dragged || this.dock.editor || document.body.classList.contains("dock-editing")) {
			return;
		}
		// The flyout never opens while the sidebar is expanded; it would overlap the sidebar's own items.
		const sidebar = this.dock.sidebar;
		if (sidebar?.sidebar_expanded) {
			this.close();
			return;
		}

		const $flyout = this.render(entry);
		if (!$flyout) {
			this.close();
			return;
		}

		this.cancel_close();
		if (this.$flyout) {
			this.hide_popover(this.$flyout[0]);
			this.$flyout.remove();
		}
		this.$tile = $tile;
		this.entry = entry;
		this.$flyout = $flyout.attr("aria-expanded", "true");
		$tile.attr("aria-expanded", "true");
		$flyout.appendTo("body");
		// Into the browser's top layer, so no z-index of anything else — sticky page heads,
		// form sidebars, modals, datepickers — can ever paint over the card. `manual` keeps
		// light-dismiss off (the flyout owns its own closing) and takes no focus. The element
		// only becomes visible here: a closed popover is display:none, so show before measure.
		this.show_popover($flyout[0]);
		this.position($tile);
		this.bind_flyout_events($flyout);
	}

	// The Popover API moves the card to the browser's top layer; both calls are guarded, since
	// the fallback is the plain fixed-position card with its fallback z-index.
	show_popover(el) {
		try {
			if (typeof el.showPopover === "function") el.showPopover();
		} catch (error) {
			// Already showing (or the API refusing): the card is visible either way.
		}
	}

	hide_popover(el) {
		try {
			if (el && typeof el.hidePopover === "function") el.hidePopover();
		} catch (error) {
			// Already hidden.
		}
	}

	// The card's rows: the workspace's sidebar elements grouped and filtered the way the sidebar
	// renders them. Returns null when nothing is visible.
	render(entry) {
		const shell = entry.module;
		const items = frappe.boot.module_sidebars[shell]?.items || [];
		const label = frappe.boot.module_sidebars[shell]?.label || entry.label;

		// The same grouping `Sidebar.nest_section_items` does: a Section Break owns the rows after
		// it that carry `child`; the rest stand alone.
		const groups = [];
		let current = null;
		items.forEach((item) => {
			if (item.type === "Section Break") {
				current = { break: item, rows: [] };
				groups.push(current);
			} else if (current && item.child) {
				current.rows.push(item);
			} else {
				current = null;
				groups.push({ break: null, rows: [item] });
			}
		});

		const esc = frappe.utils.escape_html;
		const row = (item, path, child) => {
			const icon = frappe.utils.icon(item.icon || "list", "sm", "", "", "current-color", true);
			const active = this.is_active_row(path);
			return `<button type="button" class="dock-flyout-row${child ? " dock-flyout-row--child" : ""}${
				active ? " active" : ""
			}" role="menuitem" data-path="${esc(path)}" tabindex="-1" title="${esc(
				item.label || item.link_to || ""
			)}"
				${active ? 'aria-current="page"' : ""}>
				<span class="dock-flyout-row-icon">${icon}</span>
				<span class="dock-flyout-row-label">${esc(item.label || item.link_to || "")}</span>
			</button>`;
		};

		let body = "";
		groups.forEach((group) => {
			const rows = [];
			group.rows.forEach((item) => {
				if (item.type !== "Link") return; // Spacers and standard buttons are not menu rows
				const path = frappe.ui.sidebar_item.get_route(item, false, shell);
				// The sidebar's own visibility rule: no route, no row.
				if (!path) return;
				rows.push(row(item, path, !!(item.child && group.break)));
			});
			if (!rows.length) return; // an empty section is no section at all
			if (group.break) {
				body += `<div class="dock-flyout-group-label">${esc(group.break.label || "")}</div>`;
			}
			body += rows.join("");
		});

		if (!body) return null;
		// `popover="manual"` puts the card in the browser's top layer when it is shown, above
		// every z-index the desk can muster; manual keeps light-dismiss off (the flyout owns its
		// own closing) and never takes focus.
		return $(`<div class="dock-flyout" popover="manual" role="menu" aria-label="${esc(label)}">
			<div class="dock-flyout-header">${esc(label)}</div>
			<div class="dock-flyout-body">${body}</div>
		</div>`);
	}

	// Mirrors the core of the sidebar's `route_claim`: an item claims the page it names and the
	// pages under it, compared on the decoded pathname without the query.
	is_active_row(path) {
		const strip = (value) => decodeURIComponent(String(value).split("?")[0].split("#")[0]).replace(/\/$/, "");
		const current = strip(window.location.pathname);
		const target = strip(path);
		if (!target) return false;
		return current === target || current.startsWith(target + "/");
	}

	// To the right of the tile (the left one in RTL), vertically aligned to it, clamped to the
	// viewport; the card scrolls inside when it is taller than the window.
	position($tile) {
		const el = this.$flyout[0];
		// Pinned to the origin BEFORE measuring: with `width: max-content` a card left at its
		// static position can be squeezed by the viewport edge and measure narrow.
		el.style.left = "0px";
		el.style.top = "0px";
		const rect = $tile[0].getBoundingClientRect();
		const width = el.offsetWidth;
		const height = el.offsetHeight;
		const rtl = frappe.utils.is_rtl();
		const { GAP, EDGE } = frappe.ui.DockFlyout;
		const max_height = window.innerHeight - 2 * EDGE;

		let left;
		if (rtl) left = rect.left - width - GAP;
		else left = rect.right + GAP;
		// Clamped so the card never leaves the window; the tile's own top wins while it fits.
		const top = Math.min(Math.max(rect.top, EDGE), Math.max(window.innerHeight - height - EDGE, EDGE));

		el.style.left = Math.round(left) + "px";
		el.style.top = Math.round(top) + "px";
		el.style.maxHeight = Math.min(height, max_height) + "px";
	}

	bind_flyout_events($flyout) {
		$flyout
			.on("mouseenter.dock-flyout", () => this.cancel_close())
			.on("mouseleave.dock-flyout", () => this.schedule_close())
			// The keyboard path: the tile's blur arms the grace, and focus landing in the rows
			// (Tab / Down from the tile) cancels it before it can fire.
			.on("focusin.dock-flyout", () => this.cancel_close())
			.on("focusout.dock-flyout", (e) => {
				if (!$flyout[0].contains(e.relatedTarget)) this.schedule_close();
			})
			.on("click.dock-flyout", ".dock-flyout-row", (e) => {
				const $row = $(e.currentTarget);
				const path = $row.attr("data-path");
				const item = this.entry && this.find_item(path);
				this.close();
				if (!item) return;
				if (item.link_type === "URL") {
					// A URL opens as the sidebar's own anchor would.
					if (item.open_in_new_tab) window.open(item.url, "_blank", "noopener");
					else window.location.href = item.url;
					return;
				}
				frappe.set_route(path);
			})
			.on("keydown.dock-flyout", (e) => {
				const $rows = $flyout.find(".dock-flyout-row");
				const index = $rows.index(e.target);
				if (e.key === "Escape") {
					e.stopPropagation();
					this.close(true); // focus returns to the tile
				} else if (e.key === "ArrowDown") {
					e.preventDefault();
					$rows.eq((index + 1) % $rows.length).trigger("focus");
				} else if (e.key === "ArrowUp") {
					e.preventDefault();
					$rows.eq((index - 1 + $rows.length) % $rows.length).trigger("focus");
				} else if (e.key === "Tab") {
					// The menu keeps the keyboard inside its rows; Esc or a click leaves it.
					e.preventDefault();
					$rows.eq((index + (e.shiftKey ? -1 : 1) + $rows.length) % $rows.length).trigger("focus");
				}
			});
	}

	find_item(path) {
		// The row carries the route; the item it came from is looked up by that route among the
		// shell's items, so URL rows open with the item's own target and new-tab preference.
		const items = (this.entry && frappe.boot.module_sidebars[this.entry.module]?.items) || [];
		return items.find(
			(item) => item.type === "Link" && frappe.ui.sidebar_item.get_route(item, false, this.entry.module) === path
		);
	}

	focus_first_row() {
		this.$flyout?.find(".dock-flyout-row").first().trigger("focus");
	}

	// Leaving the tile arms the grace rather than closing at once: the pointer may be crossing
	// the gap to the card (or to the next tile along the rail, which re-arms open).
	schedule_close() {
		if (this.close_timer) clearTimeout(this.close_timer);
		this.close_timer = setTimeout(() => this.close(), frappe.ui.DockFlyout.CLOSE_DELAY);
	}

	cancel_close() {
		if (this.close_timer) clearTimeout(this.close_timer);
		this.close_timer = null;
	}

	close(focus_tile = false) {
		this.cancel_close();
		if (this.open_timer) {
			clearTimeout(this.open_timer);
			this.open_timer = null;
		}
		if (!this.$flyout) return;
		const $tile = this.$tile;
		const el = this.$flyout[0];
		try {
			// Out of the top layer before the node goes away.
			if (typeof el.hidePopover === "function") el.hidePopover();
		} catch (error) {
			// Already hidden.
		}
		this.$flyout.remove();
		this.$flyout = null;
		this.$tile = null;
		this.entry = null;
		if ($tile) $tile.removeAttr("aria-expanded");
		// Esc asked for the focus back; a click or a route change follows the pointer.
		if (focus_tile && $tile?.[0]?.isConnected) $tile.trigger("focus");
	}

	// The one-time listeners: Esc wherever the focus is, route changes, window scroll and resize.
	bind_once() {
		$(document)
			.off("keydown.dock-flyout")
			.on("keydown.dock-flyout", (e) => {
				if (e.key === "Escape" && this.is_open() && !this.dock.$dock[0].contains(document.activeElement)) {
					// The tile's and the rows' own Esc handlers run first; this catches the
					// pointer-hover case, where no focus is inside either.
					e.stopPropagation();
					this.close();
				}
			})
			.off("sidebar-expand.dock-flyout")
			.on("sidebar-expand.dock-flyout", (e, data) => {
				if (data?.sidebar_expand || this.dock.sidebar?.sidebar_expanded) {
					this.close();
				}
			});
		$(window)
			.off("scroll.dock-flyout resize.dock-flyout")
			.on("scroll.dock-flyout resize.dock-flyout", () => this.close());
		frappe.router.on("change", () => this.close());
	}

	hook_sidebar() {
		const sidebar = this.dock.sidebar;
		if (!sidebar || sidebar._dock_flyout_hooked) return;
		sidebar._dock_flyout_hooked = true;
		if (typeof sidebar.open === "function") {
			const orig_open = sidebar.open.bind(sidebar);
			sidebar.open = (...args) => {
				this.close();
				return orig_open(...args);
			};
		}
	}
};
