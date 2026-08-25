import ProcessConcept from "@/src/components/process-concepts/ProcessConcept";
import "@/src/components/process-concepts/process-concepts.css";

export const metadata = {
  title: "Waiting, Zombie and Orphan Processes",
  description: "Interactive visualization of wait(), zombie states, and orphan process adoption.",
};

export default function ZombieOrphanPage() {
  return <ProcessConcept lesson="zombie" />;
}
