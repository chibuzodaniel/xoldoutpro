import { useEffect } from "react";
import { AndroidAudioTypePresets, AudioSession } from "@livekit/react-native";

/**
 * Starts LiveKit's native audio session for as long as a Live screen is
 * open. Without it the app neither captured the broadcaster's microphone
 * reliably nor played the Live's sound for viewers ("live does not pick
 * audio"). Viewers get the media profile (loudspeaker, like watching a
 * video); the broadcaster gets the voice-communication profile, which is
 * what enables proper mic capture with echo cancellation.
 */
export function useLiveAudioSession(role: "viewer" | "broadcaster") {
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await AudioSession.configureAudio({
          android: {
            preferredOutputList: ["speaker"],
            audioTypeOptions: role === "viewer" ? AndroidAudioTypePresets.media : AndroidAudioTypePresets.communication,
          },
          ios: { defaultOutput: "speaker" },
        });
        if (active) await AudioSession.startAudioSession();
      } catch {
        // Expo Go / unsupported build — the Live screen already explains that WebRTC needs a dev build.
      }
    })();
    return () => {
      active = false;
      AudioSession.stopAudioSession().catch(() => {});
    };
  }, [role]);
}
