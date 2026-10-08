import { Composition, registerRoot } from "remotion";
import {
  VideoComposition,
  type VideoCompositionProps,
} from "../frontend/components/video-composition";
import { ratios } from "../frontend/lib/editor-core.mjs";

export const FPS = 30;
type RenderProps = VideoCompositionProps & { duration: number };
const defaults: RenderProps = {
  duration: 1,
  assets: [],
  narrationSrc: null,
  draft: {
    title: "",
    transcript: "",
    script: "",
    captions: [],
    caption_style: "clean-bottom",
    editor_settings: {
      version: 1,
      aspectRatio: "9:16",
      layout: "fill",
      slots: [],
      textOverlays: [],
      videoVisible: true,
      captionsVisible: true,
      audio: {
        sourceMuted: true,
        sourceVolume: 1,
        narrationVolume: 1,
        musicAssetId: null,
        musicVolume: 0.22,
      },
    },
  },
};
function Root() {
  return (
    <Composition
      id="Recap"
      component={VideoComposition}
      defaultProps={defaults}
      width={720}
      height={1280}
      fps={FPS}
      durationInFrames={30}
      calculateMetadata={({ props }) => {
        const [width, height] = ratios[props.draft.editor_settings.aspectRatio];
        return {
          width,
          height,
          durationInFrames: Math.max(1, Math.ceil(props.duration * FPS)),
        };
      }}
    />
  );
}
registerRoot(Root);
