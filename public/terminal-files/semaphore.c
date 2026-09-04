#include <stdio.h>
#include <stdlib.h>
#include <sys/ipc.h>
#include <sys/sem.h>
#include <unistd.h>

union semun {
    int val;
    struct semid_ds *buf;
    unsigned short *array;
};

int main()
{
    key_t key = 1234;
    int semid;

    struct sembuf p = {0, -1, 0};
    struct sembuf v = {0, 1, 0};

    union semun arg;

    semid = semget(key, 1, 0666 | IPC_CREAT);

    if (semid == -1)
    {
        perror("semget failed");
        exit(1);
    }

    arg.val = 1;

    if (semctl(semid, 0, SETVAL, arg) == -1)
    {
        perror("semctl failed");
        exit(1);
    }

    printf("Trying to lock resource...\n");

    if (semop(semid, &p, 1) == -1)
    {
        perror("semop P failed");
        exit(1);
    }

    printf("Resource locked. Using resource...\n");

    sleep(5);

    printf("Releasing resource...\n");

    if (semop(semid, &v, 1) == -1)
    {
        perror("semop V failed");
        exit(1);
    }

    printf("Resource released.\n");

    return 0;
}