import { parseProject } from "@aerocel/simulation-schema";
import rawKestrel from "../../../../examples/kestrel/project.aerocel.json";

export const kestrelProject = parseProject(rawKestrel);
