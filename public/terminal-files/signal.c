#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <unistd.h>

void handle_sigtstp(int sig)
{
    printf("\nReceived SIGTSTP (Ctrl+Z) - Process is suspending...\n");

    signal(SIGTSTP, SIG_DFL);
    raise(SIGTSTP);
}

void handle_sigcont(int sig)
{
    printf("\nReceived SIGCONT - Process is resuming...\n");
}

int main()
{
    signal(SIGTSTP, handle_sigtstp);
    signal(SIGCONT, handle_sigcont);

    printf("Process PID: %d\n", getpid());

    printf("Try suspending the process with Ctrl+Z and resuming with fg.\n");

    while (1)
    {
        printf("Running... Press Ctrl+Z to suspend.\n");
        sleep(1);
    }

    return 0;
}