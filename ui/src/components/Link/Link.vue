<template>
	<Combobox
		ref="comboboxRef"
		v-model="model"
		v-model:open="open"
		class="group !gap-1 [&_[data-slot=input]:disabled]:text-ink-gray-4"
		:label="label"
		:description="description"
		:error="error"
		:required="required"
		:options="linkOptions"
		:filterable="!idLabels"
		:disabled="disabled"
		:placeholder="placeholder ?? `Search ${doctype.toLowerCase()}`"
		:loading="options.loading && !options.data"
		@update:query="handleInputChange"
		@update:selectedOption="rememberSelectedOption"
	>
		<template v-for="(_, name) in forwardedSlots" #[name]="slotProps" :key="name">
			<slot :name="name" v-bind="slotProps" />
		</template>

		<template v-if="slots.suffix" #suffix="suffixProps">
			<slot name="suffix" v-bind="suffixProps" />
		</template>
		<template v-else-if="showRedirect || showEdit || showClear" #suffix>
			<button
				v-if="showClear"
				type="button"
				aria-label="Clear"
				data-slot="clear"
				class="group-hover:grid group-focus:grid group-focus-within:grid hidden size-4 place-items-center rounded-1 text-ink-gray-5 hover:bg-surface-gray-3 hover:text-ink-gray-7 focus:outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-3"
				@click.stop="clearValue"
				@pointerdown.stop
			>
				<span class="lucide-x size-3.5" />
			</button>
			<button
				v-if="showEdit"
				type="button"
				aria-label="Edit linked record"
				data-slot="edit"
				class="group-hover:grid group-focus:grid group-focus-within:grid hidden size-4 place-items-center rounded-1 text-ink-gray-5 hover:bg-surface-gray-3 hover:text-ink-gray-7 focus:outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-3"
				@click.stop="emit('edit', model!)"
				@pointerdown.stop
			>
				<span class="lucide-square-pen size-3.5" />
			</button>
			<button
				v-if="showRedirect"
				type="button"
				aria-label="Open linked record"
				data-slot="redirect"
				class="group-hover:grid group-focus:grid group-focus-within:grid hidden size-4 place-items-center rounded-1 text-ink-gray-5 hover:bg-surface-gray-3 hover:text-ink-gray-7 focus:outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-3"
				@click.stop="emit('redirect', model!)"
				@pointerdown.stop
			>
				<span class="lucide-arrow-up-right size-3.5" />
			</button>
		</template>

		<template v-if="slots['item-create']" #item-create="slotProps">
			<slot name="item-create" v-bind="slotProps" />
		</template>
		<template v-else #item-create="{ query }">
			<div class="flex">
				<span class="truncate">
					Create
					<span v-if="query" class="font-medium text-ink-gray-8">
						{{ query }}
					</span>
				</span>
			</div>
		</template>
	</Combobox>
</template>

<script setup lang="ts">
import { isTypedSearch, toIdOption, toLinkOption } from "./linkOption";
import { computed, ref, useSlots, watch } from "vue";
import { Combobox, createResource, frappeRequest, debounce } from "frappe-ui";
import type { ComboboxOption, ComboboxCustomOption } from "frappe-ui";
import type { LinkExposed, LinkOption, LinkProps, LinkEmits } from "./types";

const props = withDefaults(defineProps<LinkProps>(), {
	filters: () => ({}),
	creatable: false,
	redirectable: false,
	editable: false,
	disabled: false,
});

const model = defineModel<string | null>({ default: null });
const open = defineModel<boolean>("open", { default: false });
const comboboxRef = ref<{ focus: () => void } | null>(null);

const emit = defineEmits<LinkEmits>();

const slots = useSlots();

const forwardedSlots = computed(() =>
	Object.fromEntries(
		Object.entries(slots).filter(([name]) => name !== "suffix" && name !== "item-create")
	)
);

const options = createResource({
	url: "frappe.desk.search.search_link",
	params: {
		doctype: props.doctype,
		txt: "",
		filters: props.filters,
	},
	method: "POST",
	resourceFetcher: frappeRequest,
	transform: (data: LinkOption[]): LinkOption[] =>
		data.map(props.idLabels ? toIdOption : toLinkOption),
});

const createNewOption: ComboboxCustomOption = {
	type: "custom",
	key: "create",
	label: "Create New",
	slot: "create",
	condition: ({ query }: { query: string }) => Boolean(query.trim()),
	onClick: ({ query }: { query: string }) => emit("create", query),
};

// The committed option, remembered so its label stays displayed across
// reloads: in input mode the input displays the selected option's LABEL, and
// a list that no longer carries the value would blank the field.
const selectedOption = ref<ComboboxOption | null>(null);

// The Combobox hands the full option over on every commit, and null on clear
// (custom "Create New" rows never commit through this event).
function rememberSelectedOption(option: ComboboxOption | ComboboxCustomOption | null) {
	if (option && "value" in option && option.value != null) {
		selectedOption.value = {
			label: String(option.label ?? option.value),
			value: option.value,
		};
	} else {
		selectedOption.value = null;
	}
}

// A value set from outside (v-model) adopts the label from the loaded list
// when it has one; the `title` prop covers the rest inside linkOptions.
watch(model, (value) => {
	if (value == null || value === "") {
		selectedOption.value = null;
		return;
	}
	if (selectedOption.value?.value === value) return;
	const match = (options.data || []).find((option: any) => option.value === value);
	selectedOption.value = match ? { label: match.label, value: value } : null;
});

const linkOptions = computed<ComboboxOption[]>(() => {
	let _options: ComboboxOption[] = options.data || [];
	const known = model.value && _options.some((option: any) => option.value === model.value);
	if (model.value && !known) {
		// the selected option always stays listed so its label keeps showing:
		// prefer the remembered option, then the `title` prop, then the raw value
		const remembered =
			selectedOption.value && selectedOption.value.value === model.value
				? selectedOption.value
				: null;
		_options = [
			{
				label: remembered?.label ?? props.title ?? String(model.value),
				value: model.value,
			},
			..._options,
		];
	}
	if (props.creatable) {
		return [..._options, createNewOption];
	}
	return _options;
});

// The label the Combobox displays for the current value — exactly what its
// display sync echoes back into update:query on select and on close.
const selectedLabel = computed<string | null>(() => {
	if (!model.value) return null;
	return linkOptions.value.find((option: any) => option.value === model.value)?.label ?? null;
});

const showClear = computed(() => !props.disabled && !!model.value);
const showRedirect = computed(() => props.redirectable && !!model.value);
const showEdit = computed(() => props.editable && !!model.value);

const loadOptions = (txt: string = "") => {
	if (!props.doctype) return;
	options.update({
		params: {
			txt,
			doctype: props.doctype,
			filters: props.filters,
		},
	});
	options.reload();
};

const handleInputChange = debounce((value: unknown) => {
	// input mode echoes the committed label (on select and again on close),
	// "" on a display reset and a re-emitted focus event — none of those is a
	// search term; only real typing searches, and the full list reloads on
	// every open below
	if (!isTypedSearch(value, { open: open.value, selectedLabel: selectedLabel.value })) return;
	loadOptions(value);
}, 300);

// Input mode: nothing is typed at open (the input shows the committed
// label), so the full list reloads here — never on the select/close echoes.
watch(open, (isOpen) => {
	if (isOpen) loadOptions("");
});

const clearValue = () => {
	model.value = null;
	open.value = false;
	comboboxRef.value?.focus();
};

watch([() => props.doctype, () => props.filters], () => loadOptions(""), {
	immediate: true,
	deep: true,
});

defineExpose<LinkExposed>({ reload: () => loadOptions("") });
</script>
