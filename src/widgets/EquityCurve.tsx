import Plot from "react-plotly.js";
import { cleanSeries } from "../utils/cleanSeries";

type Props = {
  x?: Array<number | string>;
  y?: number[];
};

export default function EquityCurve(props: Props) {
  // Placeholder demo data if none provided
  const demoX = Array.from({ length: 50 }, (_, i) => `Day ${i + 1}`);
  const demoY = demoX.map((_, i) => 100000 + i * 120 + (i % 11 === 0 ? NaN : 0)); // some NaNs on purpose

  const { x, y } = cleanSeries(props.x ?? demoX, props.y ?? demoY);

  return (
    <Plot
      data={[{ x, y, type: "scatter", mode: "lines" }]}
      layout={{ autosize: true, margin: { l: 40, r: 10, b: 30, t: 10 } }}
      useResizeHandler
      style={{ width: "100%", height: "100%" }}
    />
  );
}
