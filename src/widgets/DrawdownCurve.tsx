import Plot from "react-plotly.js";
import { cleanSeries } from "../utils/cleanSeries";

type Props = {
  x?: Array<number | string>;
  dd?: number[]; // negative numbers like -0.12
};

export default function DrawdownCurve(props: Props) {
  const demoX = Array.from({ length: 50 }, (_, i) => `Day ${i + 1}`);
  // mildly varying drawdown, mostly near 0
  const demoDD = demoX.map((_, i) => (i % 13 === 0 ? -0.03 : 0));

  const { x, y } = cleanSeries(props.x ?? demoX, props.dd ?? demoDD);

  return (
    <Plot
      data={[{ x, y, type: "scatter", mode: "lines" }]}
      layout={{
        autosize: true,
        yaxis: { autorange: true, tickformat: ",.0%" },
        margin: { l: 40, r: 10, b: 30, t: 10 }
      }}
      useResizeHandler
      style={{ width: "100%", height: "100%" }}
    />
  );
}
