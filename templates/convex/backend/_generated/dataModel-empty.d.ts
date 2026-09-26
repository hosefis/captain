/* eslint-disable */
// Preseeded by CAPTAIN. `convex dev` replaces this with Convex-generated code.
import type { GenericDataModel, DocumentByName, TableNamesInDataModel, SystemTableNames } from "convex/server";
import type { GenericId } from "convex/values";

export type DataModel = GenericDataModel;
export type TableNames = TableNamesInDataModel<DataModel>;
export type Doc<TableName extends TableNames> = DocumentByName<DataModel, TableName>;
export type Id<TableName extends TableNames | SystemTableNames> = GenericId<TableName>;
