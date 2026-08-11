#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/types.h>

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
        printf("Child process started. PID = %d, Parent PID = %d\n",
               getpid(), getppid());

        sleep(10);

        printf("Child process after sleep. PID = %d, Parent PID = %d\n",
               getpid(), getppid());

        exit(0);
    }
    else
    {
        printf("Parent process exiting. PID = %d\n", getpid());
        exit(0);
    }

    return 0;
}
