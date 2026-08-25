import ProcessConcept from "@/src/components/process-concepts/ProcessConcept";
import "@/src/components/process-concepts/process-concepts.css";

export const metadata = {
  title: "How Processes Communicate",
  description: "Interactive visualization of IPC through pipes, queues, shared memory, and signals.",
};

export default function ComsPage() {
  return <ProcessConcept lesson="coms" />;
}
