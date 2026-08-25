import ProcessConcept from "@/src/components/process-concepts/ProcessConcept";
import "@/src/components/process-concepts/process-concepts.css";

export const metadata = {
  title: "How a Program Becomes a Process",
  description: "Interactive visualization of loading, memory, OS queues, scheduling, and execution.",
};

export default function ProcessPage() {
  return <ProcessConcept lesson="process" />;
}
