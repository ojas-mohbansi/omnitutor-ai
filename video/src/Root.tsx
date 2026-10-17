import React from 'react';
import { Composition, Folder } from 'remotion';
import { OmniTutorFilm } from './OmniTutorFilm';
import { Scene1Opening } from './scenes/Scene1Opening';
import { Scene2Interface } from './scenes/Scene2Interface';
import { Scene3ApiBoundary } from './scenes/Scene3ApiBoundary';
import { Scene4CorePipeline } from './scenes/Scene4CorePipeline';
import { Scene5IntelligencePipeline } from './scenes/Scene5IntelligencePipeline';
import { Scene6SafetyGrounding } from './scenes/Scene6SafetyGrounding';
import { Scene7ResponseJourney } from './scenes/Scene7ResponseJourney';
import { Scene8Architecture } from './scenes/Scene8Architecture';
import { TOTAL_FRAMES, FPS, SCENE_DURATIONS } from './constants';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="OmniTutorFilm"
      component={OmniTutorFilm}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
    <Folder name="Scenes">
      <Composition id="Scene1Opening"    component={Scene1Opening}    durationInFrames={SCENE_DURATIONS.scene1} fps={FPS} width={1920} height={1080} />
      <Composition id="Scene2Interface"  component={Scene2Interface}  durationInFrames={SCENE_DURATIONS.scene2} fps={FPS} width={1920} height={1080} />
      <Composition id="Scene3ApiBoundary" component={Scene3ApiBoundary} durationInFrames={SCENE_DURATIONS.scene3} fps={FPS} width={1920} height={1080} />
      <Composition id="Scene4CorePipeline" component={Scene4CorePipeline} durationInFrames={SCENE_DURATIONS.scene4} fps={FPS} width={1920} height={1080} />
      <Composition id="Scene5IntelligencePipeline" component={Scene5IntelligencePipeline} durationInFrames={SCENE_DURATIONS.scene5} fps={FPS} width={1920} height={1080} />
      <Composition id="Scene6SafetyGrounding" component={Scene6SafetyGrounding} durationInFrames={SCENE_DURATIONS.scene6} fps={FPS} width={1920} height={1080} />
      <Composition id="Scene7ResponseJourney" component={Scene7ResponseJourney} durationInFrames={SCENE_DURATIONS.scene7} fps={FPS} width={1920} height={1080} />
      <Composition id="Scene8Architecture" component={Scene8Architecture} durationInFrames={SCENE_DURATIONS.scene8} fps={FPS} width={1920} height={1080} />
    </Folder>
  </>
);
