// Minimal typings for the parts of clipper-lib used for polygon offsetting.
declare module "clipper-lib" {
  type IntPoint = { X: number; Y: number };
  type Path = IntPoint[];
  const ClipperLib: {
    ClipperOffset: new (miterLimit?: number, arcTolerance?: number) => {
      AddPath(path: Path, joinType: number, endType: number): void;
      Execute(solution: Path[], delta: number): void;
    };
    JoinType: { jtSquare: number; jtRound: number; jtMiter: number };
    EndType: { etClosedPolygon: number };
  };
  export default ClipperLib;
}
