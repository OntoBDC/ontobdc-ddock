/**
 * A node of an explorer tree; a node with `children` (even empty) is a directory. A node that is an
 * entity of the container says which: the group of its dataset and its global id.
 */
export type ExplorerNode = { name: string; children?: ExplorerNode[]; entity?: { group: string; id: string } };
