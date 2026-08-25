import ProcessConcept from "@/src/components/process-concepts/ProcessConcept";
import "@/src/components/process-concepts/process-concepts.css";

export const metadata = {
  title: "How fork() Creates a Child Process",
  description: "Interactive visualization of parent and child process creation with fork().",
};

export default function ForkPage() {
  return <ProcessConcept lesson="fork" />;
}
