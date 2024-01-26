import { expect, test } from "@jest/globals";
import type { Instance, Instances } from "./schema/instances";
import {
  findFragmentInstanceIds,
  findTreeInstanceIds,
  findTreeInstanceIdsExcludingSlotDescendants,
  parseComponentName,
} from "./instances-utils";

const toMap = <T extends { id: string }>(list: T[]) =>
  new Map(list.map((item) => [item.id, item]));

const createInstance = (
  id: Instance["id"],
  component: string,
  children: Instance["children"]
): Instance => {
  return {
    type: "instance",
    id,
    component,
    children,
  };
};

test("find all tree instances", () => {
  const instances: Instances = toMap([
    createInstance("1", "Body", [{ type: "id", value: "3" }]),
    // this is outside of subtree
    createInstance("2", "Box", []),
    // these should be matched
    createInstance("3", "Box", [
      { type: "id", value: "4" },
      { type: "id", value: "5" },
    ]),
    createInstance("4", "Box", []),
    createInstance("5", "Box", []),
    // this one is from other tree
    createInstance("6", "Box", []),
  ]);
  expect(findTreeInstanceIds(instances, "3")).toEqual(new Set(["3", "4", "5"]));
});

test("find all tree instances excluding slot descendants", () => {
  const instances: Instances = toMap([
    createInstance("root", "Body", [
      { type: "id", value: "box1" },
      { type: "id", value: "box2" },
    ]),
    // this is outside of subtree
    createInstance("outside", "Box", []),
    // these should be matched
    createInstance("box1", "Box", [
      { type: "id", value: "slot11" },
      { type: "id", value: "box12" },
    ]),
    createInstance("slot11", "Slot", [
      { type: "id", value: "box111" },
      { type: "id", value: "box112" },
    ]),
    createInstance("box12", "Box", []),
    createInstance("box2", "Box", []),
  ]);
  expect(
    findTreeInstanceIdsExcludingSlotDescendants(instances, "box1")
  ).toEqual(new Set(["box1", "box12", "slot11"]));
});

test("find all fragment instances", () => {
  const instances: Instances = toMap([
    createInstance("body", "Body", [
      { type: "id", value: "box" },
      { type: "id", value: "slot1" },
    ]),
    createInstance("box", "Box", []),
    createInstance("slot1", "Slot", [{ type: "id", value: "fragment1" }]),
    createInstance("fragment1", "Fragment", [{ type: "id", value: "slot2" }]),
    createInstance("slot2", "Slot", [{ type: "id", value: "fragment2" }]),
    createInstance("fragment2", "Fragment", []),
  ]);
  expect(findFragmentInstanceIds(instances, "body")).toEqual(
    new Set(["fragment1", "fragment2"])
  );
});

test("extract short name and namespace from component name", () => {
  expect(parseComponentName("Box")).toEqual([undefined, "Box"]);
  expect(parseComponentName("radix:Box")).toEqual(["radix", "Box"]);
});
