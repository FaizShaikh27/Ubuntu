#include <stdio.h>
#include <stdlib.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

int main()
{
    pid_t pid = fork();

    if (pid < 0)
    {
        perror("fork failed");
        exit(1);
    }
    else if (pid == 0)
    {
        printf("Child process (PID: %d) is exiting.\n", getpid());
        exit(0);
    }
    else
    {
        printf("Parent process (PID: %d) sleeping...\n", getpid());

        sleep(30);

        wait(NULL);

        printf("Parent process cleaned up child.\n");
    }

    return 0;
}
