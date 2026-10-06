"use client";

import { useState, type ReactNode } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { useEditorMotion } from "@/shared/lib/use-editor-motion";
import { newCustomSection, type DraftFormValues } from "@/features/cv-editor/model/draft-form";
import {
  PREDEFINED_OPTIONS,
  canAddCustom,
  customHoldsEntry,
  holdsEntry,
  inDocumentOrder,
  offeredOptions,
  sectionsWithEntries,
  showAddSectionCard,
  type PredefinedKind,
} from "@/features/cv-editor/model/optional-sections";
import { AddSectionCard } from "./add-section-card";
import { CertificationsSection } from "./certifications-section";
import { CustomSectionCard } from "./custom-section";
import { HobbiesSection } from "./hobbies-section";
import { LanguagesSection } from "./languages-section";
import { PortfolioSection } from "./portfolio-section";

type Removal = { kind: PredefinedKind } | { customId: string } | null;

const labelOf = (kind: PredefinedKind): string => PREDEFINED_OPTIONS.find((option) => option.kind === kind)?.label ?? kind;

/**
 * The optional sections (Figma "Add a section"): the sections the person has added, in document
 * order, then the card that offers the rest. A section is shown while it holds an entry or while
 * it was added and is still empty; an empty one is not saved (see `toDraft`).
 */
export function OptionalSections() {
  const { control, getValues, setValue } = useFormContext<DraftFormValues>();
  const [added, setAdded] = useState<PredefinedKind[]>(() => sectionsWithEntries(getValues()));
  const [removing, setRemoving] = useState<Removal>(null);
  const [announcement, setAnnouncement] = useState("");
  const motionRef = useEditorMotion();
  const custom = useFieldArray({ control, name: "customSections" });
  // The form's own ids are stable between the server and the browser; `field.id` is random each time.
  const customEntries = useWatch({ control, name: "customSections" });
  const [certifications, languages, hobbies, portfolio] = useWatch({
    control,
    name: ["certifications", "languages", "hobbies", "portfolio"],
  });
  const withEntries = sectionsWithEntries({ certifications, languages, hobbies, portfolio, customSections: [] });
  // What the form holds counts too: a version chosen after a save conflict can bring sections in.
  const visible = inDocumentOrder([...new Set([...added, ...withEntries])]);

  function addSection(kind: PredefinedKind): void {
    setAdded((current) => [...current, kind]);
    setAnnouncement(`${labelOf(kind)} section added.`);
  }

  function addCustom(): void {
    const entry = newCustomSection();
    custom.append(entry);
    setAnnouncement("Custom section added.");
  }

  function dropSection(kind: PredefinedKind): void {
    const cleared = { shouldDirty: true, shouldValidate: true };
    if (kind === "certifications") setValue("certifications", [], cleared);
    else if (kind === "languages") setValue("languages", [], cleared);
    else if (kind === "portfolio") setValue("portfolio", [], cleared);
    else setValue("hobbies", [], cleared);
    setAdded((current) => current.filter((item) => item !== kind));
    setAnnouncement(`${labelOf(kind)} section removed.`);
  }

  function dropCustom(id: string): void {
    const index = getValues("customSections").findIndex((section) => section.id === id);
    if (index >= 0) custom.remove(index);
    setAnnouncement("Custom section removed.");
  }

  function requestRemoval(removal: Exclude<Removal, null>): void {
    if ("kind" in removal) {
      if (holdsEntry(getValues(), removal.kind)) setRemoving(removal);
      else dropSection(removal.kind);
      return;
    }
    const section = getValues("customSections").find((entry) => entry.id === removal.customId);
    if (section && customHoldsEntry(section)) setRemoving(removal);
    else dropCustom(removal.customId);
  }

  const cards: Record<PredefinedKind, (onRemove: () => void) => ReactNode> = {
    certifications: (onRemove) => <CertificationsSection onRemoveSection={onRemove} />,
    languages: (onRemove) => <LanguagesSection onRemoveSection={onRemove} />,
    portfolio: (onRemove) => <PortfolioSection onRemoveSection={onRemove} />,
    hobbies: (onRemove) => <HobbiesSection onRemoveSection={onRemove} />,
  };

  const removingLabel =
    removing === null ? "" : "kind" in removing ? labelOf(removing.kind) : (getValues("customSections").find((section) => section.id === removing.customId)?.title.trim() || "this section");

  return (
    <>
      <div ref={motionRef} className="flex flex-col gap-4 empty:hidden">
      {visible.map((kind) => (
        <div key={kind}>{cards[kind](() => requestRemoval({ kind }))}</div>
      ))}
      {custom.fields.map((field, index) => {
        const id = customEntries[index]?.id ?? field.id;
        return (
          <div key={field.id}>
            <CustomSectionCard index={index} id={id} onRemoveSection={() => requestRemoval({ customId: id })} />
          </div>
        );
      })}
      {showAddSectionCard(visible, custom.fields.length) ? (
        <AddSectionCard
          options={offeredOptions(visible)}
          canAddCustom={canAddCustom(custom.fields.length)}
          onAdd={addSection}
          onAddCustom={addCustom}
        />
      ) : null}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {removing !== null ? (
        <ConfirmDialog
          title={`Remove ${removingLabel}?`}
          confirmLabel="Remove section"
          onConfirm={() => {
            if ("kind" in removing) dropSection(removing.kind);
            else dropCustom(removing.customId);
          }}
          onClose={() => setRemoving(null)}
        >
          Everything you entered in this section will be removed from your CV.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
